using System.Diagnostics;
using System.IO.Pipes;
using System.Runtime.InteropServices;
using System.Security.Principal;
using System.Text;
using System.Text.Json;

internal sealed record ElevatedTerminationRequest
{
    public long Id { get; init; }
    public string Command { get; init; } = "";
    public int[] Pids { get; init; } = [];
}

internal static class ElevatedTerminationClient
{
    private const int ProtocolVersion = 1;
    private const int MaximumPidCount = 64;
    private const int MaximumRequestLength = 16 * 1024;
    private static readonly HashSet<string> ProtectedProcessNames = new(StringComparer.OrdinalIgnoreCase)
    {
        "system",
        "system idle process",
        "registry",
        "smss",
        "csrss",
        "wininit",
        "services",
        "lsass",
        "winlogon",
        "dwm"
    };

    public static async Task<int> Run(string[] args, JsonSerializerOptions options)
    {
        var pipeName = Option(args, "--pipe");
        var nonce = Option(args, "--nonce");
        if (!int.TryParse(Option(args, "--parent-pid"), out var parentPid) || parentPid <= 0)
            throw new InvalidOperationException("A valid parent PID is required");
        if (string.IsNullOrWhiteSpace(pipeName) || pipeName.Length > 180 || pipeName.Contains('\\') || pipeName.Contains('/'))
            throw new InvalidOperationException("A valid local pipe name is required");
        if (nonce.Length != 64 || !nonce.All(Uri.IsHexDigit))
            throw new InvalidOperationException("A valid session nonce is required");
        if (!IsElevated()) throw new UnauthorizedAccessException("The termination helper must run elevated");

        using var parent = Process.GetProcessById(parentPid);
        using var current = Process.GetCurrentProcess();
        if (parent.HasExited || parent.SessionId != current.SessionId)
            throw new UnauthorizedAccessException("The parent process is unavailable or belongs to another session");

        using var pipe = new NamedPipeClientStream(".", pipeName, PipeDirection.InOut, PipeOptions.Asynchronous);
        await pipe.ConnectAsync(15_000);
        if (!GetNamedPipeServerProcessId(pipe.SafePipeHandle.DangerousGetHandle(), out var serverPid) || serverPid != parentPid)
            throw new UnauthorizedAccessException("The pipe server identity does not match the parent process");

        using var lifetime = new CancellationTokenSource();
        parent.EnableRaisingEvents = true;
        parent.Exited += (_, _) => lifetime.Cancel();
        if (parent.HasExited) return 0;

        using var reader = new StreamReader(pipe, new UTF8Encoding(false), false, 4096, leaveOpen: true);
        using var writer = new StreamWriter(pipe, new UTF8Encoding(false), 4096, leaveOpen: true) { AutoFlush = true };
        await writer.WriteLineAsync(JsonSerializer.Serialize(new
        {
            type = "hello",
            protocol = ProtocolVersion,
            pid = Environment.ProcessId,
            parentPid,
            nonce,
            isElevated = true
        }, options));

        try
        {
            while (!lifetime.IsCancellationRequested)
            {
                var line = await reader.ReadLineAsync(lifetime.Token);
                if (line is null) break;
                if (string.IsNullOrWhiteSpace(line)) continue;
                if (line.Length > MaximumRequestLength)
                {
                    await writer.WriteLineAsync(JsonSerializer.Serialize(new { id = 0, ok = false, error = "Request is too large" }, options));
                    continue;
                }

                long id = 0;
                try
                {
                    var request = JsonSerializer.Deserialize<ElevatedTerminationRequest>(line, options)
                        ?? throw new InvalidOperationException("Invalid request");
                    id = request.Id;
                    switch (request.Command.Trim().ToLowerInvariant())
                    {
                        case "ping":
                            await writer.WriteLineAsync(JsonSerializer.Serialize(new { id, ok = true, result = new { ready = true } }, options));
                            break;
                        case "terminate":
                            var terminatedPids = Terminate(request.Pids, parentPid, current.Id, parent.SessionId);
                            await writer.WriteLineAsync(JsonSerializer.Serialize(new { id, ok = true, result = new { terminatedPids } }, options));
                            break;
                        case "shutdown":
                            await writer.WriteLineAsync(JsonSerializer.Serialize(new { id, ok = true, result = new { stopped = true } }, options));
                            return 0;
                        default:
                            throw new InvalidOperationException("Unsupported privileged request");
                    }
                }
                catch (Exception ex)
                {
                    await writer.WriteLineAsync(JsonSerializer.Serialize(new { id, ok = false, error = ex.Message }, options));
                }
            }
        }
        catch (OperationCanceledException) when (lifetime.IsCancellationRequested)
        {
            // The ordinary GUI exited. Closing the helper releases portable files promptly.
        }
        return 0;
    }

    private static int[] Terminate(int[] requestedPids, int parentPid, int helperPid, int sessionId)
    {
        var pids = requestedPids.Where(pid => pid > 0).Distinct().Order().ToArray();
        if (pids.Length == 0) return [];
        if (pids.Length > MaximumPidCount) throw new InvalidOperationException($"At most {MaximumPidCount} PIDs may be terminated at once");
        if (pids.Any(pid => pid <= 4 || pid == parentPid || pid == helperPid))
            throw new UnauthorizedAccessException("A protected Start Engineer or system process was requested");

        var parents = CaptureParentProcessIds();
        var targets = new List<Process>();
        try
        {
            foreach (var pid in pids)
            {
                Process process;
                try { process = Process.GetProcessById(pid); }
                catch (ArgumentException) { continue; }
                targets.Add(process);
                if (process.HasExited) continue;
                if (process.SessionId != sessionId) throw new UnauthorizedAccessException($"PID {pid} belongs to another Windows session");
                if (ProtectedProcessNames.Contains(process.ProcessName)) throw new UnauthorizedAccessException($"PID {pid} is a protected Windows process");
                if (IsAncestorOf(pid, parentPid, parents) || IsAncestorOf(pid, helperPid, parents))
                    throw new UnauthorizedAccessException($"PID {pid} owns part of the Start Engineer process tree");
            }

            var terminated = new List<int>();
            foreach (var process in targets)
            {
                try
                {
                    if (!process.HasExited) process.Kill(entireProcessTree: true);
                    terminated.Add(process.Id);
                }
                catch (ArgumentException)
                {
                    terminated.Add(process.Id);
                }
            }
            return terminated.ToArray();
        }
        finally
        {
            foreach (var process in targets) process.Dispose();
        }
    }

    private static Dictionary<int, int> CaptureParentProcessIds()
    {
        var result = new Dictionary<int, int>();
        var snapshot = NativeMethods.CreateToolhelp32Snapshot(0x00000002, 0);
        if (snapshot == new IntPtr(-1)) return result;
        try
        {
            var row = new NativeMethods.ProcessEntry32 { Size = (uint)Marshal.SizeOf<NativeMethods.ProcessEntry32>() };
            if (!NativeMethods.Process32First(snapshot, ref row)) return result;
            do
            {
                result[unchecked((int)row.ProcessId)] = unchecked((int)row.ParentProcessId);
                row.Size = (uint)Marshal.SizeOf<NativeMethods.ProcessEntry32>();
            } while (NativeMethods.Process32Next(snapshot, ref row));
        }
        finally
        {
            _ = NativeMethods.CloseHandle(snapshot);
        }
        return result;
    }

    private static bool IsAncestorOf(int candidateAncestor, int processId, IReadOnlyDictionary<int, int> parents)
    {
        var seen = new HashSet<int>();
        var current = processId;
        while (current > 0 && seen.Add(current) && parents.TryGetValue(current, out var parent))
        {
            if (parent == candidateAncestor) return true;
            current = parent;
        }
        return false;
    }

    private static bool IsElevated()
    {
        using var identity = WindowsIdentity.GetCurrent();
        return new WindowsPrincipal(identity).IsInRole(WindowsBuiltInRole.Administrator);
    }

    private static string Option(string[] args, string name)
    {
        var index = Array.FindIndex(args, value => string.Equals(value, name, StringComparison.OrdinalIgnoreCase));
        return index >= 0 && index + 1 < args.Length ? args[index + 1].Trim() : "";
    }

    [DllImport("kernel32.dll", SetLastError = true)]
    [return: MarshalAs(UnmanagedType.Bool)]
    private static extern bool GetNamedPipeServerProcessId(IntPtr pipe, out int serverProcessId);
}
