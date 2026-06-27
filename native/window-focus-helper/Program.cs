using System.Diagnostics;
using System.Runtime.InteropServices;
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
        default:
            Console.Error.WriteLine("Usage: window-focus-helper.exe scan|focus");
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

    [LibraryImport("kernel32.dll")]
    [return: MarshalAs(UnmanagedType.Bool)]
    public static partial bool CloseHandle(IntPtr handle);

    [DllImport("kernel32.dll", EntryPoint = "QueryFullProcessImageNameW", CharSet = CharSet.Unicode, SetLastError = true)]
    [return: MarshalAs(UnmanagedType.Bool)]
    public static extern bool QueryFullProcessImageName(IntPtr process, int flags, StringBuilder exeName, ref int size);
}
