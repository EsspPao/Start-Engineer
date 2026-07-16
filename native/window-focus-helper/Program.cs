using System.Diagnostics;
using System.IO.Compression;
using System.Runtime.InteropServices;
using System.Security.Principal;
using System.Text;
using System.Text.Json;
using System.Text.Json.Serialization;

var options = new JsonSerializerOptions
{
    PropertyNamingPolicy = JsonNamingPolicy.CamelCase,
    DefaultIgnoreCondition = JsonIgnoreCondition.WhenWritingNull
};

try
{
    var command = args.FirstOrDefault()?.Trim().ToLowerInvariant();
    if (command == "runtime") return await RuntimeServer.Run(options);
    var input = Console.In.ReadToEnd();
    switch (command)
    {
        case "scan":
        {
            var stages = JsonSerializer.Deserialize<List<FocusStage>>(input, options) ?? [];
            Console.Write(JsonSerializer.Serialize(WindowScanner.Scan(stages), options));
            return 0;
        }
        case "focus":
        {
            var request = JsonSerializer.Deserialize<FocusRequest>(input, options) ?? new FocusRequest();
            Console.Write(JsonSerializer.Serialize(WindowFocuser.Focus(request), options));
            return 0;
        }
        case "launch":
        {
            var request = JsonSerializer.Deserialize<LaunchRequest>(input, options) ?? new LaunchRequest();
            Console.Write(JsonSerializer.Serialize(ProcessLauncher.Launch(request), options));
            return 0;
        }
        case "is-elevated":
            Console.Write(JsonSerializer.Serialize(PrivilegeDetector.GetStatus(), options));
            return 0;
        case "snapshot":
        {
            var request = JsonSerializer.Deserialize<SnapshotRequest>(input, options) ?? new SnapshotRequest();
            Console.Write(JsonSerializer.Serialize(ProcessCollector.Collect(request), options));
            return 0;
        }
        case "extract":
        {
            var request = JsonSerializer.Deserialize<ExtractRequest>(input, options) ?? new ExtractRequest();
            ArchiveExtractor.Extract(request);
            Console.Write(JsonSerializer.Serialize(new { ok = true }, options));
            return 0;
        }
        case "shortcuts":
        {
            var request = JsonSerializer.Deserialize<ShortcutRequest>(input, options) ?? new ShortcutRequest();
            Console.Write(JsonSerializer.Serialize(ShortcutResolver.Resolve(request), options));
            return 0;
        }
        case "icon":
        {
            var request = JsonSerializer.Deserialize<IconRequest>(input, options) ?? new IconRequest();
            Console.Write(JsonSerializer.Serialize(ShellIconExtractor.Extract(request), options));
            return 0;
        }
        default:
            Console.Error.WriteLine("Usage: window-focus-helper.exe scan|focus|launch|is-elevated|snapshot|extract|shortcuts|icon|runtime");
            return 2;
    }
}
catch (Exception ex)
{
    Console.Error.WriteLine(ex.Message);
    return 1;
}

internal sealed record FocusStage
{
    public string Label { get; init; } = "candidate";
    public int[] Pids { get; init; } = [];
    public string[] TitleKeywords { get; init; } = [];
    public string[] ClassKeywords { get; init; } = [];
    public string[] ProcessNameKeywords { get; init; } = [];
    public string[] PathKeywords { get; init; } = [];
}

internal sealed record WindowCandidate
{
    public long Handle { get; init; }
    public int Pid { get; init; }
    public string Title { get; init; } = "";
    public int Score { get; init; }
    public string? ClassName { get; init; }
    public string? ProcessName { get; init; }
    public string? ExecutablePath { get; init; }
    public int? ProcessError { get; init; }
    public string? MatchReason { get; init; }
    public string? FilterReason { get; init; }
    public long? ExStyle { get; init; }
    public bool? Visible { get; init; }
    public bool? Iconic { get; init; }
    public bool? ToolWindow { get; init; }
    public long? Owner { get; init; }
    public int? Width { get; init; }
    public int? Height { get; init; }
    public string? Stage { get; init; }
}

internal sealed record ScanResult
{
    public int AllWindowsScanned { get; init; }
    public List<WindowCandidate> RelatedWindows { get; init; } = [];
    public List<WindowCandidate> FilteredWindows { get; init; } = [];
    public List<WindowCandidate> FinalCandidates { get; init; } = [];
}

internal sealed record FocusRequest
{
    public long Handle { get; init; }
    public int[] ExpectedPids { get; init; } = [];
}

internal sealed record FocusResult
{
    public bool Focused { get; init; }
    public string? Reason { get; init; }
    public long ForegroundHandle { get; init; }
    public int ForegroundPid { get; init; }
    public int TargetPid { get; init; }
    public bool Visible { get; init; }
}

internal sealed record LaunchRequest
{
    public string ExecutablePath { get; init; } = "";
    public string WorkingDirectory { get; init; } = "";
    public string ArgumentLine { get; init; } = "";
    public string[] Arguments { get; init; } = [];
    public bool Elevated { get; init; }
    public bool WaitForExit { get; init; }
}

internal sealed record NativeLaunchResult
{
    public bool Ok { get; init; }
    public int Pid { get; init; }
    public int ErrorCode { get; init; }
    public int? ExitCode { get; init; }
    public string? Detail { get; init; }
}

internal sealed record PrivilegeStatus
{
    public bool IsElevated { get; init; }
}

internal sealed record ProcessSnapshotRow
{
    public int Pid { get; init; }
    public int ParentPid { get; init; }
    public string Name { get; init; } = "";
    public string Path { get; init; } = "";
    public double CpuSeconds { get; init; }
    public long MemoryBytes { get; init; }
    public long ReadBytes { get; init; }
    public long WriteBytes { get; init; }
}

internal sealed record SnapshotRequest
{
    public string Mode { get; init; } = "full";
    public string[] ManagedNames { get; init; } = [];
    public int[] ManagedPids { get; init; } = [];
}

internal sealed record ExtractRequest
{
    public string ZipPath { get; init; } = "";
    public string Destination { get; init; } = "";
}

internal sealed record ShortcutRoot
{
    public string Path { get; init; } = "";
    public string Source { get; init; } = "";
}

internal sealed record ShortcutRequest
{
    public ShortcutRoot[] Roots { get; init; } = [];
    public string[] Paths { get; init; } = [];
    public string Source { get; init; } = "";
}

internal sealed record ShortcutResult
{
    public string Name { get; init; } = "";
    public string TargetPath { get; init; } = "";
    public string ShortcutPath { get; init; } = "";
    public string WorkingDirectory { get; init; } = "";
    public string LaunchArgs { get; init; } = "";
    public string IconPath { get; init; } = "";
    public string Source { get; init; } = "";
}

internal sealed record IconRequest
{
    public string Path { get; init; } = "";
    public int PixelSize { get; init; } = 256;
}

internal sealed record IconResult
{
    public bool Ok { get; init; }
    public string PngBase64 { get; init; } = "";
}

internal sealed record RuntimeRequest
{
    public long Id { get; init; }
    public string Command { get; init; } = "";
    public JsonElement Payload { get; init; }
}

internal static class RuntimeServer
{
    public static async Task<int> Run(JsonSerializerOptions options)
    {
        while (await Console.In.ReadLineAsync() is { } line)
        {
            if (string.IsNullOrWhiteSpace(line)) continue;
            long id = 0;
            try
            {
                var request = JsonSerializer.Deserialize<RuntimeRequest>(line, options) ?? throw new InvalidOperationException("Invalid runtime request");
                id = request.Id;
                object result = request.Command.Trim().ToLowerInvariant() switch
                {
                    "launch" => ProcessLauncher.Launch(request.Payload.Deserialize<LaunchRequest>(options) ?? new LaunchRequest()),
                    "is-elevated" => PrivilegeDetector.GetStatus(),
                    "snapshot" => ProcessCollector.Collect(request.Payload.Deserialize<SnapshotRequest>(options) ?? new SnapshotRequest()),
                    "ping" => new { ready = true },
                    _ => throw new InvalidOperationException($"Unsupported runtime command: {request.Command}")
                };
                Console.WriteLine(JsonSerializer.Serialize(new { id, ok = true, result }, options));
            }
            catch (Exception ex)
            {
                Console.WriteLine(JsonSerializer.Serialize(new { id, ok = false, error = ex.Message }, options));
            }
            await Console.Out.FlushAsync();
        }
        return 0;
    }
}

internal static class PrivilegeDetector
{
    public static PrivilegeStatus GetStatus()
    {
        using var identity = WindowsIdentity.GetCurrent();
        var principal = new WindowsPrincipal(identity);
        return new PrivilegeStatus { IsElevated = principal.IsInRole(WindowsBuiltInRole.Administrator) };
    }
}

internal static class ArchiveExtractor
{
    public static void Extract(ExtractRequest request)
    {
        if (string.IsNullOrWhiteSpace(request.ZipPath) || !File.Exists(request.ZipPath)) throw new FileNotFoundException("Archive does not exist", request.ZipPath);
        if (string.IsNullOrWhiteSpace(request.Destination)) throw new InvalidOperationException("Archive destination is required");
        Directory.CreateDirectory(request.Destination);
        ZipFile.ExtractToDirectory(request.ZipPath, request.Destination, true);
    }
}

internal static class ShortcutResolver
{
    public static List<ShortcutResult> Resolve(ShortcutRequest request)
    {
        var candidates = new List<(string Path, string Source)>();
        foreach (var root in request.Roots)
        {
            if (string.IsNullOrWhiteSpace(root.Path) || !Directory.Exists(root.Path)) continue;
            try
            {
                var options = new EnumerationOptions { RecurseSubdirectories = true, IgnoreInaccessible = true, ReturnSpecialDirectories = false };
                candidates.AddRange(Directory.EnumerateFiles(root.Path, "*.lnk", options).Select(path => (path, root.Source)));
            }
            catch { }
        }
        candidates.AddRange(request.Paths.Where(path => path.EndsWith(".lnk", StringComparison.OrdinalIgnoreCase) && File.Exists(path)).Select(path => (path, request.Source)));

        var shellType = Type.GetTypeFromProgID("WScript.Shell") ?? throw new InvalidOperationException("WScript.Shell is unavailable");
        var shell = Activator.CreateInstance(shellType) ?? throw new InvalidOperationException("Could not create WScript.Shell");
        try
        {
            var results = new List<ShortcutResult>();
            foreach (var candidate in candidates.DistinctBy(item => item.Path, StringComparer.OrdinalIgnoreCase))
            {
                object? shortcut = null;
                try
                {
                    shortcut = shellType.InvokeMember("CreateShortcut", System.Reflection.BindingFlags.InvokeMethod, null, shell, [candidate.Path]);
                    if (shortcut is null) continue;
                    var shortcutType = shortcut.GetType();
                    string Read(string property) => Convert.ToString(shortcutType.InvokeMember(property, System.Reflection.BindingFlags.GetProperty, null, shortcut, null)) ?? "";
                    var targetPath = Read("TargetPath");
                    if (string.IsNullOrWhiteSpace(targetPath)) continue;
                    results.Add(new ShortcutResult
                    {
                        Name = System.IO.Path.GetFileNameWithoutExtension(candidate.Path),
                        TargetPath = targetPath,
                        ShortcutPath = candidate.Path,
                        WorkingDirectory = Read("WorkingDirectory"),
                        LaunchArgs = Read("Arguments"),
                        IconPath = Read("IconLocation"),
                        Source = candidate.Source
                    });
                }
                catch { }
                finally
                {
                    if (shortcut is not null && Marshal.IsComObject(shortcut)) _ = Marshal.FinalReleaseComObject(shortcut);
                }
            }
            return results;
        }
        finally
        {
            if (Marshal.IsComObject(shell)) _ = Marshal.FinalReleaseComObject(shell);
        }
    }
}

internal static class ShellIconExtractor
{
    public static IconResult Extract(IconRequest request)
    {
        if (string.IsNullOrWhiteSpace(request.Path) || !File.Exists(request.Path)) throw new FileNotFoundException("Icon source does not exist", request.Path);
        var iid = typeof(NativeMethods.IShellItemImageFactory).GUID;
        var result = NativeMethods.SHCreateItemFromParsingName(request.Path, IntPtr.Zero, ref iid, out var factory);
        if (result != 0) Marshal.ThrowExceptionForHR(result);
        if (factory is null) throw new InvalidOperationException("Shell icon factory is unavailable");
        var bitmapHandle = IntPtr.Zero;
        try
        {
            var size = Math.Clamp(request.PixelSize, 32, 512);
            result = factory.GetImage(new NativeMethods.NativeSize { Width = size, Height = size }, 0x00000004, out bitmapHandle);
            if (result != 0 || bitmapHandle == IntPtr.Zero) Marshal.ThrowExceptionForHR(result);
            using var bitmap = System.Drawing.Image.FromHbitmap(bitmapHandle);
            using var stream = new MemoryStream();
            bitmap.Save(stream, System.Drawing.Imaging.ImageFormat.Png);
            return new IconResult { Ok = true, PngBase64 = Convert.ToBase64String(stream.ToArray()) };
        }
        finally
        {
            if (bitmapHandle != IntPtr.Zero) _ = NativeMethods.DeleteObject(bitmapHandle);
            if (Marshal.IsComObject(factory)) _ = Marshal.FinalReleaseComObject(factory);
        }
    }
}

internal static class ProcessLauncher
{
    public static NativeLaunchResult Launch(LaunchRequest request)
    {
        if (string.IsNullOrWhiteSpace(request.ExecutablePath))
        {
            return Failure(2, "Executable path is required");
        }

        var executablePath = Path.GetFullPath(request.ExecutablePath);
        var workingDirectory = string.IsNullOrWhiteSpace(request.WorkingDirectory)
            ? Path.GetDirectoryName(executablePath) ?? Environment.CurrentDirectory
            : Path.GetFullPath(request.WorkingDirectory);
        if (!File.Exists(executablePath)) return Failure(2, "Executable does not exist");
        if (!Directory.Exists(workingDirectory)) return Failure(267, "Working directory does not exist");

        var arguments = request.ArgumentLine.Trim();
        if (arguments.Length == 0 && request.Arguments.Length > 0)
        {
            arguments = string.Join(" ", request.Arguments.Select(QuoteArgument));
        }

        return request.Elevated
            ? LaunchElevated(executablePath, workingDirectory, arguments, request.WaitForExit)
            : LaunchNormal(executablePath, workingDirectory, arguments, request.WaitForExit);
    }

    private static NativeLaunchResult LaunchNormal(string executablePath, string workingDirectory, string arguments, bool waitForExit)
    {
        var startup = new NativeMethods.StartupInfo { Size = Marshal.SizeOf<NativeMethods.StartupInfo>() };
        var commandLine = new StringBuilder(QuoteArgument(executablePath));
        if (arguments.Length > 0) commandLine.Append(' ').Append(arguments);
        if (!NativeMethods.CreateProcess(executablePath, commandLine, IntPtr.Zero, IntPtr.Zero, false, 0x00000400, IntPtr.Zero, workingDirectory, ref startup, out var processInfo))
        {
            return Failure(Marshal.GetLastWin32Error(), "CreateProcessW failed");
        }

        try
        {
            return Success(unchecked((int)processInfo.ProcessId), processInfo.ProcessHandle, waitForExit);
        }
        finally
        {
            if (processInfo.ThreadHandle != IntPtr.Zero) _ = NativeMethods.CloseHandle(processInfo.ThreadHandle);
            if (processInfo.ProcessHandle != IntPtr.Zero) _ = NativeMethods.CloseHandle(processInfo.ProcessHandle);
        }
    }

    private static NativeLaunchResult LaunchElevated(string executablePath, string workingDirectory, string arguments, bool waitForExit)
    {
        var info = new NativeMethods.ShellExecuteInfo
        {
            Size = Marshal.SizeOf<NativeMethods.ShellExecuteInfo>(),
            Mask = 0x00000040 | 0x00000100,
            Verb = "runas",
            File = executablePath,
            Parameters = arguments,
            Directory = workingDirectory,
            Show = 1
        };
        if (!NativeMethods.ShellExecuteEx(ref info))
        {
            return Failure(Marshal.GetLastWin32Error(), "ShellExecuteExW failed");
        }

        try
        {
            var pid = info.ProcessHandle == IntPtr.Zero ? 0 : unchecked((int)NativeMethods.GetProcessId(info.ProcessHandle));
            return Success(pid, info.ProcessHandle, waitForExit);
        }
        finally
        {
            if (info.ProcessHandle != IntPtr.Zero) _ = NativeMethods.CloseHandle(info.ProcessHandle);
        }
    }

    private static NativeLaunchResult Success(int pid, IntPtr processHandle, bool waitForExit)
    {
        int? exitCode = null;
        if (waitForExit && processHandle != IntPtr.Zero)
        {
            _ = NativeMethods.WaitForSingleObject(processHandle, uint.MaxValue);
            if (NativeMethods.GetExitCodeProcess(processHandle, out var rawExitCode)) exitCode = unchecked((int)rawExitCode);
        }
        return new NativeLaunchResult { Ok = true, Pid = pid, ExitCode = exitCode };
    }

    private static NativeLaunchResult Failure(int errorCode, string detail) => new()
    {
        Ok = false,
        ErrorCode = errorCode,
        Detail = detail
    };

    private static string QuoteArgument(string value)
    {
        if (value.Length > 0 && !value.Any(char.IsWhiteSpace) && !value.Contains('"')) return value;
        var result = new StringBuilder("\"");
        var backslashes = 0;
        foreach (var character in value)
        {
            if (character == '\\')
            {
                backslashes++;
                continue;
            }
            if (character == '"')
            {
                result.Append('\\', backslashes * 2 + 1).Append('"');
                backslashes = 0;
                continue;
            }
            result.Append('\\', backslashes).Append(character);
            backslashes = 0;
        }
        result.Append('\\', backslashes * 2).Append('"');
        return result.ToString();
    }
}

internal static class ProcessCollector
{
    public static List<ProcessSnapshotRow> Collect(SnapshotRequest request)
    {
        var entries = SnapshotEntries();
        var selected = SelectEntries(entries, request);
        var rows = new List<ProcessSnapshotRow>(selected.Count);
        foreach (var entry in selected)
        {
            if (entry.Pid <= 0) continue;
            var path = "";
            double cpuSeconds = 0;
            long memoryBytes = 0;
            long readBytes = 0;
            long writeBytes = 0;
            var handle = NativeMethods.OpenProcess(0x1000, false, unchecked((uint)entry.Pid));
            if (handle != IntPtr.Zero)
            {
                try
                {
                    var pathBuilder = new StringBuilder(32768);
                    var pathLength = pathBuilder.Capacity;
                    if (NativeMethods.QueryFullProcessImageName(handle, 0, pathBuilder, ref pathLength)) path = pathBuilder.ToString();
                    if (NativeMethods.GetProcessTimes(handle, out _, out _, out var kernelTime, out var userTime))
                    {
                        cpuSeconds = (kernelTime.Value + userTime.Value) / 10_000_000d;
                    }
                    var memory = new NativeMethods.ProcessMemoryCounters { Size = (uint)Marshal.SizeOf<NativeMethods.ProcessMemoryCounters>() };
                    if (NativeMethods.GetProcessMemoryInfo(handle, ref memory, memory.Size)) memoryBytes = ClampToLong(memory.WorkingSetSize.ToUInt64());
                    if (NativeMethods.GetProcessIoCounters(handle, out var io))
                    {
                        readBytes = ClampToLong(io.ReadTransferCount);
                        writeBytes = ClampToLong(io.WriteTransferCount);
                    }
                }
                finally
                {
                    _ = NativeMethods.CloseHandle(handle);
                }
            }
            rows.Add(new ProcessSnapshotRow
            {
                Pid = entry.Pid,
                ParentPid = entry.ParentPid,
                Name = Path.GetFileNameWithoutExtension(entry.Name),
                Path = path,
                CpuSeconds = cpuSeconds,
                MemoryBytes = memoryBytes,
                ReadBytes = readBytes,
                WriteBytes = writeBytes
            });
        }
        return rows;
    }

    private static List<SnapshotEntry> SelectEntries(Dictionary<int, SnapshotEntry> entries, SnapshotRequest request)
    {
        if (!request.Mode.Equals("managed", StringComparison.OrdinalIgnoreCase)) return entries.Values.ToList();
        var names = request.ManagedNames.Select(NormalizeName).Where(value => value.Length > 0).ToHashSet(StringComparer.OrdinalIgnoreCase);
        var selectedPids = request.ManagedPids.Where(pid => pid > 0).ToHashSet();
        foreach (var entry in entries.Values)
        {
            if (names.Contains(NormalizeName(entry.Name))) selectedPids.Add(entry.Pid);
        }
        var changed = true;
        while (changed)
        {
            changed = false;
            foreach (var entry in entries.Values)
            {
                if (!selectedPids.Contains(entry.ParentPid) || selectedPids.Contains(entry.Pid)) continue;
                selectedPids.Add(entry.Pid);
                changed = true;
            }
        }
        return entries.Values.Where(entry => selectedPids.Contains(entry.Pid)).ToList();
    }

    private static Dictionary<int, SnapshotEntry> SnapshotEntries()
    {
        var result = new Dictionary<int, SnapshotEntry>();
        var snapshot = NativeMethods.CreateToolhelp32Snapshot(0x00000002, 0);
        if (snapshot == new IntPtr(-1)) throw new InvalidOperationException($"CreateToolhelp32Snapshot failed: {Marshal.GetLastWin32Error()}");
        try
        {
            var row = new NativeMethods.ProcessEntry32 { Size = (uint)Marshal.SizeOf<NativeMethods.ProcessEntry32>() };
            if (!NativeMethods.Process32First(snapshot, ref row)) return result;
            do
            {
                var pid = unchecked((int)row.ProcessId);
                result[pid] = new SnapshotEntry(pid, unchecked((int)row.ParentProcessId), row.ExeFile ?? "");
                row.Size = (uint)Marshal.SizeOf<NativeMethods.ProcessEntry32>();
            } while (NativeMethods.Process32Next(snapshot, ref row));
        }
        finally
        {
            _ = NativeMethods.CloseHandle(snapshot);
        }
        return result;
    }

    private static long ClampToLong(ulong value) => value > long.MaxValue ? long.MaxValue : (long)value;
    private static string NormalizeName(string value) => Path.GetFileNameWithoutExtension(value).Trim().ToLowerInvariant();
    private sealed record SnapshotEntry(int Pid, int ParentPid, string Name);
}

internal static class WindowScanner
{
    public static ScanResult Scan(List<FocusStage> stages)
    {
        var normalized = stages
            .Select((stage, index) => new NormalizedStage(stage, index))
            .Where(stage => stage.HasMatchers)
            .ToList();
        var related = new List<WindowCandidate>();
        var scanned = 0;

        NativeMethods.EnumWindows((handle, _) =>
        {
            scanned++;
            var candidate = ScoreWindow(handle, normalized);
            if (candidate is not null) related.Add(candidate);
            return true;
        }, IntPtr.Zero);

        var ordered = related.OrderByDescending(candidate => candidate.Score).ToList();
        return new ScanResult
        {
            AllWindowsScanned = scanned,
            RelatedWindows = ordered,
            FilteredWindows = ordered.Where(candidate => !string.IsNullOrWhiteSpace(candidate.FilterReason)).ToList(),
            FinalCandidates = ordered.Where(candidate => string.IsNullOrWhiteSpace(candidate.FilterReason)).ToList()
        };
    }

    private static WindowCandidate? ScoreWindow(IntPtr handle, List<NormalizedStage> stages)
    {
        _ = NativeMethods.GetWindowThreadProcessId(handle, out var rawPid);
        var pid = unchecked((int)rawPid);
        var title = GetWindowText(handle);
        var className = GetClassName(handle);
        var process = ProcessLookup.Get(pid);
        var visible = NativeMethods.IsWindowVisible(handle);
        var iconic = NativeMethods.IsIconic(handle);
        var exStyle = NativeMethods.GetWindowLongPtr(handle, -20).ToInt64();
        var toolWindow = (exStyle & 0x00000080) != 0;
        var owner = NativeMethods.GetWindow(handle, 4).ToInt64();
        _ = NativeMethods.GetWindowRect(handle, out var rect);
        var width = Math.Max(0, rect.Right - rect.Left);
        var height = Math.Max(0, rect.Bottom - rect.Top);
        var lowerTitle = title.ToLowerInvariant();
        var lowerClass = className.ToLowerInvariant();
        var lowerProcessName = process.Name.ToLowerInvariant();
        var lowerPath = NormalizePath(process.Path);

        foreach (var stage in stages)
        {
            var matchedByPid = stage.Pids.Contains(pid);
            var matchedByTitle = ContainsAny(lowerTitle, stage.TitleKeywords);
            var matchedByClass = ContainsAny(lowerClass, stage.ClassKeywords);
            var matchedByProcess = ContainsAny(lowerProcessName, stage.ProcessNameKeywords);
            var matchedByPath = ContainsAny(lowerPath, stage.PathKeywords);
            if (!(matchedByPid || matchedByTitle || matchedByClass || matchedByProcess || matchedByPath)) continue;

            var score = 1000 - (stage.Index * 100);
            if (matchedByPid) score += 40;
            if (matchedByTitle) score += 14;
            if (matchedByClass) score += 24;
            if (matchedByProcess) score += 18;
            if (matchedByPath) score += 18;
            if (visible) score += 120;
            else if (iconic) score += 85;
            else score -= 180;
            score += title.Length > 0 ? 42 : -24;
            if (width >= 240 && height >= 160) score += 36;
            else if (width >= 120 && height >= 80) score += 12;
            else score -= 55;
            score += owner == 0 ? 18 : -18;
            if (toolWindow) score -= 45;

            var matchReason = string.Join("+", new[]
            {
                matchedByPid ? "pid" : "",
                matchedByTitle ? "title" : "",
                matchedByClass ? "class" : "",
                matchedByProcess ? "process" : "",
                matchedByPath ? "path" : ""
            }.Where(value => value.Length > 0));
            var filterReason = NonInteractiveFilter(title, lowerTitle, className, lowerClass, visible, toolWindow, owner, width, height);
            if (filterReason.Length == 0)
            {
                filterReason = WeChatShellFilter(matchReason, title, lowerTitle, className, lowerClass, lowerProcessName, lowerPath, visible, iconic);
            }
            if (filterReason.Length > 0) score -= 420;

            return new WindowCandidate
            {
                Handle = handle.ToInt64(),
                Pid = pid,
                Title = title,
                Score = score,
                ClassName = className,
                ProcessName = process.Name,
                ExecutablePath = process.Path,
                ProcessError = process.Error == 0 ? null : process.Error,
                MatchReason = matchReason,
                FilterReason = filterReason.Length == 0 ? null : filterReason,
                ExStyle = exStyle,
                Visible = visible,
                Iconic = iconic,
                ToolWindow = toolWindow,
                Owner = owner,
                Width = width,
                Height = height,
                Stage = stage.Label
            };
        }

        return null;
    }

    private static string NonInteractiveFilter(string title, string lowerTitle, string className, string lowerClass, bool visible, bool toolWindow, long owner, int width, int height)
    {
        if (lowerTitle.Contains("wxtrayiconmessagewindow", StringComparison.Ordinal) ||
            lowerClass.Contains("wxtrayiconmessagewindow", StringComparison.Ordinal))
        {
            return "wechat-tray-message-window";
        }

        var exactClass = new HashSet<string>(StringComparer.OrdinalIgnoreCase)
        {
            "IME",
            "MSCTFIME UI",
            "Base_PowerMessageWindow",
            "OwlElectron_NotifyIconHostWindow",
            "crashpad_SessionEndWatcher",
            "Chrome_SystemMessageWindow",
            "DisplayICC_SystemMessageWindow",
            "libusb-1.0-windows-hotplug"
        };
        if (exactClass.Contains(className) || title.Equals("Default IME", StringComparison.OrdinalIgnoreCase))
        {
            return "non-interactive-window";
        }

        if (!visible && title.Length == 0 && className.Equals("Chrome_WidgetWin_0", StringComparison.OrdinalIgnoreCase))
        {
            return "non-interactive-window";
        }

        if (!visible && toolWindow)
        {
            return "non-interactive-window";
        }

        if (!visible && width == 0 && height == 0)
        {
            return "non-interactive-window";
        }

        if (!visible && owner != 0 && (lowerClass.Contains("ime", StringComparison.Ordinal) || lowerTitle.Contains("ime", StringComparison.Ordinal)))
        {
            return "non-interactive-window";
        }

        return "";
    }

    private static string WeChatShellFilter(string matchReason, string title, string lowerTitle, string className, string lowerClass, string lowerProcessName, string lowerPath, bool visible, bool iconic)
    {
        var related = (matchReason.Contains("title", StringComparison.Ordinal) ||
                       matchReason.Contains("class", StringComparison.Ordinal) ||
                       matchReason.Contains("process", StringComparison.Ordinal) ||
                       matchReason.Contains("path", StringComparison.Ordinal)) &&
                      (lowerTitle.Contains("微信", StringComparison.Ordinal) ||
                       lowerTitle.Contains("wechat", StringComparison.Ordinal) ||
                       lowerTitle.Contains("weixin", StringComparison.Ordinal) ||
                       lowerClass.Contains("wechat", StringComparison.Ordinal) ||
                       lowerClass.Contains("weixin", StringComparison.Ordinal) ||
                       lowerClass.Contains("qwindowicon", StringComparison.Ordinal) ||
                       lowerProcessName.Contains("wechat", StringComparison.Ordinal) ||
                       lowerProcessName.Contains("weixin", StringComparison.Ordinal) ||
                       lowerPath.Contains("wechat", StringComparison.Ordinal) ||
                       lowerPath.Contains("weixin", StringComparison.Ordinal) ||
                       lowerPath.Contains("xwechat", StringComparison.Ordinal));
        if (!related) return "";
        var taskbarWindow = iconic && visible && System.Text.RegularExpressions.Regex.IsMatch(className, "^Qt.*QWindowIcon$");
        if (!taskbarWindow && (System.Text.RegularExpressions.Regex.IsMatch(className, "^(Qt.*QWindowIcon|AboutWindow|Static)$") ||
            title.Contains("WECHAT_AUTH_MESSAGE_WINDOW_RECEIVER", StringComparison.Ordinal))
           )
        {
            return "suspected-wechat-shell";
        }
        return "";
    }

    private static bool ContainsAny(string haystack, HashSet<string> keywords) => keywords.Any(haystack.Contains);

    private static string NormalizePath(string value) => value.Trim().Replace('/', '\\').ToLowerInvariant();

    private static string GetWindowText(IntPtr handle)
    {
        var length = NativeMethods.GetWindowTextLength(handle);
        var builder = new StringBuilder(Math.Max(512, length + 1));
        _ = NativeMethods.GetWindowText(handle, builder, builder.Capacity);
        return builder.ToString();
    }

    private static string GetClassName(IntPtr handle)
    {
        var builder = new StringBuilder(256);
        _ = NativeMethods.GetClassName(handle, builder, builder.Capacity);
        return builder.ToString();
    }

    private sealed class NormalizedStage
    {
        public NormalizedStage(FocusStage stage, int index)
        {
            Label = string.IsNullOrWhiteSpace(stage.Label) ? "candidate" : stage.Label.Trim();
            Index = index;
            Pids = stage.Pids.Where(pid => pid > 0).ToHashSet();
            TitleKeywords = stage.TitleKeywords.Select(value => value.Trim().ToLowerInvariant()).Where(value => value.Length > 0).ToHashSet();
            ClassKeywords = stage.ClassKeywords.Select(value => value.Trim().ToLowerInvariant()).Where(value => value.Length > 0).ToHashSet();
            ProcessNameKeywords = stage.ProcessNameKeywords.Select(NormalizeName).Where(value => value.Length > 0).ToHashSet();
            PathKeywords = stage.PathKeywords.Select(NormalizePath).Where(value => value.Length > 0).ToHashSet();
        }

        public string Label { get; }
        public int Index { get; }
        public HashSet<int> Pids { get; }
        public HashSet<string> TitleKeywords { get; }
        public HashSet<string> ClassKeywords { get; }
        public HashSet<string> ProcessNameKeywords { get; }
        public HashSet<string> PathKeywords { get; }
        public bool HasMatchers => Pids.Count > 0 || TitleKeywords.Count > 0 || ClassKeywords.Count > 0 || ProcessNameKeywords.Count > 0 || PathKeywords.Count > 0;

        private static string NormalizeName(string value)
        {
            var leaf = value.Split('\\', '/').LastOrDefault() ?? value;
            return leaf.EndsWith(".exe", StringComparison.OrdinalIgnoreCase)
                ? leaf[..^4].Trim().ToLowerInvariant()
                : leaf.Trim().ToLowerInvariant();
        }
    }
}

internal static class WindowFocuser
{
    public static FocusResult Focus(FocusRequest request)
    {
        var handle = new IntPtr(request.Handle);
        if (request.Handle <= 0 || !NativeMethods.IsWindow(handle))
        {
            return new FocusResult { Focused = false, Reason = "no-window" };
        }

        _ = NativeMethods.GetWindowThreadProcessId(handle, out var rawTargetPid);
        var targetPid = unchecked((int)rawTargetPid);
        var expected = request.ExpectedPids.Where(pid => pid > 0).ToHashSet();
        if (expected.Count > 0 && !expected.Contains(targetPid))
        {
            return new FocusResult { Focused = false, Reason = "no-window", TargetPid = targetPid };
        }

        var visibleBefore = NativeMethods.IsWindowVisible(handle);
        var iconicBefore = NativeMethods.IsIconic(handle);
        if (iconicBefore)
        {
            _ = NativeMethods.ShowWindowAsync(handle, 9);
            Thread.Sleep(25);
        }
        else if (!visibleBefore)
        {
            _ = NativeMethods.ShowWindowAsync(handle, 5);
            Thread.Sleep(25);
        }

        _ = NativeMethods.BringWindowToTop(handle);
        _ = NativeMethods.SetForegroundWindow(handle);
        Thread.Sleep(35);

        var state = ForegroundState(handle, targetPid);
        if (state.Focused) return state;

        var foregroundThread = state.ForegroundHandle == 0
            ? 0
            : NativeMethods.GetWindowThreadProcessId(new IntPtr(state.ForegroundHandle), out _);
        var targetThread = NativeMethods.GetWindowThreadProcessId(handle, out rawTargetPid);
        targetPid = unchecked((int)rawTargetPid);
        var currentThread = NativeMethods.GetCurrentThreadId();
        try
        {
            if (foregroundThread != 0) _ = NativeMethods.AttachThreadInput(currentThread, foregroundThread, true);
            if (targetThread != 0) _ = NativeMethods.AttachThreadInput(currentThread, targetThread, true);
            _ = NativeMethods.BringWindowToTop(handle);
            _ = NativeMethods.SetForegroundWindow(handle);
            Thread.Sleep(35);
        }
        finally
        {
            if (targetThread != 0) _ = NativeMethods.AttachThreadInput(currentThread, targetThread, false);
            if (foregroundThread != 0) _ = NativeMethods.AttachThreadInput(currentThread, foregroundThread, false);
        }

        return ForegroundState(handle, targetPid);
    }

    private static FocusResult ForegroundState(IntPtr handle, int targetPid)
    {
        var visible = NativeMethods.IsWindowVisible(handle);
        var foreground = NativeMethods.GetForegroundWindow();
        var foregroundPid = 0;
        if (foreground != IntPtr.Zero)
        {
            _ = NativeMethods.GetWindowThreadProcessId(foreground, out var rawForegroundPid);
            foregroundPid = unchecked((int)rawForegroundPid);
        }

        var focused = foreground == handle || (foregroundPid == targetPid && visible);
        return new FocusResult
        {
            Focused = focused,
            Reason = focused ? null : visible ? "foreground-blocked" : "tray-hidden",
            ForegroundHandle = foreground.ToInt64(),
            ForegroundPid = foregroundPid,
            TargetPid = targetPid,
            Visible = visible
        };
    }
}

internal static class ProcessLookup
{
    private static readonly Dictionary<int, ProcessInfo> Cache = [];

    public static ProcessInfo Get(int pid)
    {
        if (Cache.TryGetValue(pid, out var cached)) return cached;
        var name = "";
        var path = "";
        var error = 0;
        try
        {
            using var process = Process.GetProcessById(pid);
            name = process.ProcessName;
        }
        catch
        {
            error = 1;
        }

        var handle = NativeMethods.OpenProcess(0x1000, false, (uint)Math.Max(0, pid));
        if (handle != IntPtr.Zero)
        {
            try
            {
                var builder = new StringBuilder(1024);
                var size = builder.Capacity;
                if (NativeMethods.QueryFullProcessImageName(handle, 0, builder, ref size))
                {
                    path = builder.ToString();
                }
                else
                {
                    error = Marshal.GetLastWin32Error();
                }
            }
            finally
            {
                _ = NativeMethods.CloseHandle(handle);
            }
        }
        else if (pid > 0)
        {
            error = Marshal.GetLastWin32Error();
        }

        if (name.Length == 0 && path.Length > 0)
        {
            name = Path.GetFileNameWithoutExtension(path);
        }

        var info = new ProcessInfo(name, path, error);
        Cache[pid] = info;
        return info;
    }

    public sealed record ProcessInfo(string Name, string Path, int Error);
}

internal static partial class NativeMethods
{
    public delegate bool EnumWindowsProc(IntPtr hWnd, IntPtr lParam);

    [StructLayout(LayoutKind.Sequential)]
    public struct Rect
    {
        public int Left;
        public int Top;
        public int Right;
        public int Bottom;
    }

    [StructLayout(LayoutKind.Sequential, CharSet = CharSet.Unicode)]
    public struct StartupInfo
    {
        public int Size;
        public string? Reserved;
        public string? Desktop;
        public string? Title;
        public int X;
        public int Y;
        public int XSize;
        public int YSize;
        public int XCountChars;
        public int YCountChars;
        public int FillAttribute;
        public int Flags;
        public short ShowWindow;
        public short Reserved2;
        public IntPtr Reserved2Pointer;
        public IntPtr StandardInput;
        public IntPtr StandardOutput;
        public IntPtr StandardError;
    }

    [StructLayout(LayoutKind.Sequential)]
    public struct ProcessInformation
    {
        public IntPtr ProcessHandle;
        public IntPtr ThreadHandle;
        public uint ProcessId;
        public uint ThreadId;
    }

    [StructLayout(LayoutKind.Sequential, CharSet = CharSet.Unicode)]
    public struct ShellExecuteInfo
    {
        public int Size;
        public uint Mask;
        public IntPtr Window;
        public string? Verb;
        public string? File;
        public string? Parameters;
        public string? Directory;
        public int Show;
        public IntPtr Instance;
        public IntPtr IdList;
        public string? Class;
        public IntPtr ClassKey;
        public uint HotKey;
        public IntPtr IconOrMonitor;
        public IntPtr ProcessHandle;
    }

    [StructLayout(LayoutKind.Sequential, CharSet = CharSet.Unicode)]
    public struct ProcessEntry32
    {
        public uint Size;
        public uint Usage;
        public uint ProcessId;
        public IntPtr DefaultHeapId;
        public uint ModuleId;
        public uint Threads;
        public uint ParentProcessId;
        public int PriorityClassBase;
        public uint Flags;
        [MarshalAs(UnmanagedType.ByValTStr, SizeConst = 260)]
        public string ExeFile;
    }

    [StructLayout(LayoutKind.Sequential)]
    public struct FileTime
    {
        public uint LowDateTime;
        public uint HighDateTime;
        public long Value => ((long)HighDateTime << 32) | LowDateTime;
    }

    [StructLayout(LayoutKind.Sequential)]
    public struct ProcessMemoryCounters
    {
        public uint Size;
        public uint PageFaultCount;
        public UIntPtr PeakWorkingSetSize;
        public UIntPtr WorkingSetSize;
        public UIntPtr QuotaPeakPagedPoolUsage;
        public UIntPtr QuotaPagedPoolUsage;
        public UIntPtr QuotaPeakNonPagedPoolUsage;
        public UIntPtr QuotaNonPagedPoolUsage;
        public UIntPtr PagefileUsage;
        public UIntPtr PeakPagefileUsage;
    }

    [StructLayout(LayoutKind.Sequential)]
    public struct IoCounters
    {
        public ulong ReadOperationCount;
        public ulong WriteOperationCount;
        public ulong OtherOperationCount;
        public ulong ReadTransferCount;
        public ulong WriteTransferCount;
        public ulong OtherTransferCount;
    }

    [StructLayout(LayoutKind.Sequential)]
    public struct NativeSize
    {
        public int Width;
        public int Height;
    }

    [ComImport]
    [Guid("bcc18b79-ba16-442f-80c4-8a59c30c463b")]
    [InterfaceType(ComInterfaceType.InterfaceIsIUnknown)]
    public interface IShellItemImageFactory
    {
        [PreserveSig]
        int GetImage(NativeSize size, uint flags, out IntPtr bitmap);
    }

    [LibraryImport("user32.dll")]
    [return: MarshalAs(UnmanagedType.Bool)]
    public static partial bool EnumWindows(EnumWindowsProc lpEnumFunc, IntPtr lParam);

    [LibraryImport("user32.dll")]
    [return: MarshalAs(UnmanagedType.Bool)]
    public static partial bool IsWindow(IntPtr hWnd);

    [LibraryImport("user32.dll")]
    [return: MarshalAs(UnmanagedType.Bool)]
    public static partial bool IsWindowVisible(IntPtr hWnd);

    [LibraryImport("user32.dll")]
    [return: MarshalAs(UnmanagedType.Bool)]
    public static partial bool IsIconic(IntPtr hWnd);

    [LibraryImport("user32.dll")]
    [return: MarshalAs(UnmanagedType.Bool)]
    public static partial bool ShowWindowAsync(IntPtr hWnd, int nCmdShow);

    [LibraryImport("user32.dll")]
    [return: MarshalAs(UnmanagedType.Bool)]
    public static partial bool BringWindowToTop(IntPtr hWnd);

    [LibraryImport("user32.dll")]
    [return: MarshalAs(UnmanagedType.Bool)]
    public static partial bool SetForegroundWindow(IntPtr hWnd);

    [LibraryImport("user32.dll")]
    public static partial IntPtr GetForegroundWindow();

    [LibraryImport("user32.dll")]
    public static partial uint GetWindowThreadProcessId(IntPtr hWnd, out uint processId);

    [LibraryImport("kernel32.dll")]
    public static partial uint GetCurrentThreadId();

    [LibraryImport("user32.dll")]
    [return: MarshalAs(UnmanagedType.Bool)]
    public static partial bool AttachThreadInput(uint idAttach, uint idAttachTo, [MarshalAs(UnmanagedType.Bool)] bool fAttach);

    [LibraryImport("user32.dll")]
    public static partial IntPtr GetWindow(IntPtr hWnd, uint uCmd);

    [LibraryImport("user32.dll")]
    [return: MarshalAs(UnmanagedType.Bool)]
    public static partial bool GetWindowRect(IntPtr hWnd, out Rect rect);

    [DllImport("user32.dll", EntryPoint = "GetWindowLongPtrW", SetLastError = true)]
    public static extern IntPtr GetWindowLongPtr(IntPtr hWnd, int nIndex);

    [LibraryImport("user32.dll", EntryPoint = "GetWindowTextLengthW")]
    public static partial int GetWindowTextLength(IntPtr hWnd);

    [DllImport("user32.dll", EntryPoint = "GetWindowTextW", CharSet = CharSet.Unicode)]
    public static extern int GetWindowText(IntPtr hWnd, StringBuilder text, int count);

    [DllImport("user32.dll", EntryPoint = "GetClassNameW", CharSet = CharSet.Unicode)]
    public static extern int GetClassName(IntPtr hWnd, StringBuilder text, int count);

    [LibraryImport("kernel32.dll", EntryPoint = "OpenProcess")]
    public static partial IntPtr OpenProcess(uint access, [MarshalAs(UnmanagedType.Bool)] bool inheritHandle, uint processId);

    [DllImport("kernel32.dll", EntryPoint = "CreateProcessW", CharSet = CharSet.Unicode, SetLastError = true)]
    [return: MarshalAs(UnmanagedType.Bool)]
    public static extern bool CreateProcess(string applicationName, StringBuilder commandLine, IntPtr processAttributes, IntPtr threadAttributes, [MarshalAs(UnmanagedType.Bool)] bool inheritHandles, uint creationFlags, IntPtr environment, string currentDirectory, ref StartupInfo startupInfo, out ProcessInformation processInformation);

    [DllImport("shell32.dll", EntryPoint = "ShellExecuteExW", CharSet = CharSet.Unicode, SetLastError = true)]
    [return: MarshalAs(UnmanagedType.Bool)]
    public static extern bool ShellExecuteEx(ref ShellExecuteInfo executeInfo);

    [LibraryImport("kernel32.dll")]
    public static partial uint GetProcessId(IntPtr process);

    [LibraryImport("kernel32.dll")]
    public static partial uint WaitForSingleObject(IntPtr handle, uint milliseconds);

    [LibraryImport("kernel32.dll")]
    [return: MarshalAs(UnmanagedType.Bool)]
    public static partial bool GetExitCodeProcess(IntPtr process, out uint exitCode);

    [LibraryImport("kernel32.dll")]
    [return: MarshalAs(UnmanagedType.Bool)]
    public static partial bool GetProcessTimes(IntPtr process, out FileTime creationTime, out FileTime exitTime, out FileTime kernelTime, out FileTime userTime);

    [LibraryImport("kernel32.dll")]
    [return: MarshalAs(UnmanagedType.Bool)]
    public static partial bool GetProcessIoCounters(IntPtr process, out IoCounters counters);

    [DllImport("psapi.dll", SetLastError = true)]
    [return: MarshalAs(UnmanagedType.Bool)]
    public static extern bool GetProcessMemoryInfo(IntPtr process, ref ProcessMemoryCounters counters, uint size);

    [LibraryImport("kernel32.dll", SetLastError = true)]
    public static partial IntPtr CreateToolhelp32Snapshot(uint flags, uint processId);

    [DllImport("kernel32.dll", EntryPoint = "Process32FirstW", CharSet = CharSet.Unicode, SetLastError = true)]
    [return: MarshalAs(UnmanagedType.Bool)]
    public static extern bool Process32First(IntPtr snapshot, ref ProcessEntry32 entry);

    [DllImport("kernel32.dll", EntryPoint = "Process32NextW", CharSet = CharSet.Unicode, SetLastError = true)]
    [return: MarshalAs(UnmanagedType.Bool)]
    public static extern bool Process32Next(IntPtr snapshot, ref ProcessEntry32 entry);

    [DllImport("shell32.dll", EntryPoint = "SHCreateItemFromParsingName", CharSet = CharSet.Unicode, PreserveSig = true)]
    public static extern int SHCreateItemFromParsingName(string path, IntPtr bindContext, ref Guid iid, [MarshalAs(UnmanagedType.Interface)] out IShellItemImageFactory factory);

    [LibraryImport("gdi32.dll")]
    [return: MarshalAs(UnmanagedType.Bool)]
    public static partial bool DeleteObject(IntPtr handle);

    [LibraryImport("kernel32.dll")]
    [return: MarshalAs(UnmanagedType.Bool)]
    public static partial bool CloseHandle(IntPtr handle);

    [DllImport("kernel32.dll", EntryPoint = "QueryFullProcessImageNameW", CharSet = CharSet.Unicode, SetLastError = true)]
    [return: MarshalAs(UnmanagedType.Bool)]
    public static extern bool QueryFullProcessImageName(IntPtr process, int flags, StringBuilder exeName, ref int size);
}
