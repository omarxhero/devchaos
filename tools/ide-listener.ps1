# IDE prompt listener — WH_KEYBOARD_LL hook, line-buffered, Enter-flushed.
# Emits one JSON line per finished line: {"line":"..","title":"..","proc":".."}
# RAM-only: buffer cleared after every Enter; nothing is written to disk.
# Filtering (IDE gate, natural-language gate) happens in the Electron main process.

# Parent watchdog: if the Electron app dies without cleanup (taskkill, crash),
# a watchdog job kills this listener so the keyboard hook never outlives its owner.
$parentPid = $PID
try {
  $p = Get-CimInstance Win32_Process -Filter "ProcessId=$PID"
  while ($p.ParentProcessId) {
    $pp = Get-CimInstance Win32_Process -Filter "ProcessId=$($p.ParentProcessId)" -ErrorAction SilentlyContinue
    if (-not $pp) { break }
    $p = $pp
    if ($p.Name -eq 'electron.exe') { $parentPid = $p.ProcessId; break }
  }
} catch { }

$watchdog = {
  param($me, $ppid)
  while ($true) {
    Start-Sleep -Seconds 5
    if (-not (Get-Process -Id $ppid -ErrorAction SilentlyContinue)) {
      Stop-Process -Id $me -Force -ErrorAction SilentlyContinue
      break
    }
  }
}
if ($parentPid -and $parentPid -ne $PID) {
  Start-Job -ScriptBlock $watchdog -ArgumentList $PID, $parentPid | Out-Null
}

Add-Type -TypeDefinition @'
using System;
using System.Diagnostics;
using System.Runtime.InteropServices;
using System.Text;

public class KListener {
    delegate IntPtr HookProc(int nCode, IntPtr wParam, IntPtr lParam);

    [DllImport("user32.dll")] static extern IntPtr SetWindowsHookEx(int id, HookProc cb, IntPtr hMod, uint tid);
    [DllImport("user32.dll")] static extern bool UnhookWindowsHookEx(IntPtr hhk);
    [DllImport("user32.dll")] static extern IntPtr CallNextHookEx(IntPtr hhk, int nCode, IntPtr wParam, IntPtr lParam);
    [DllImport("kernel32.dll")] static extern IntPtr GetModuleHandle(string m);
    [DllImport("user32.dll")] static extern IntPtr GetForegroundWindow();
    [DllImport("user32.dll")] static extern int GetWindowText(IntPtr h, StringBuilder s, int n);
    [DllImport("user32.dll")] static extern uint GetWindowThreadProcessId(IntPtr h, out uint pid);
    [DllImport("user32.dll")] static extern short GetKeyState(int vk);
    [DllImport("user32.dll")] static extern bool GetKeyboardState(byte[] ks);
    [DllImport("user32.dll")] static extern short ToUnicodeEx(uint vk, uint sc, byte[] ks, StringBuilder buf, int n, uint flags, IntPtr kl);
    [DllImport("user32.dll")] static extern IntPtr GetKeyboardLayout(uint tid);

    [StructLayout(LayoutKind.Sequential)]
    struct KBDLLHOOKSTRUCT { public uint vk, sc, flags, time; public IntPtr extra; }
    [StructLayout(LayoutKind.Sequential)]
    struct MSG { public IntPtr hwnd; public uint message; public IntPtr wParam, lParam; public uint time; public int ptX, ptY; }

    [DllImport("user32.dll")] static extern int GetMessage(out MSG m, IntPtr h, uint a, uint b);

    static HookProc proc;
    static IntPtr hhk;
    static readonly StringBuilder line = new StringBuilder(512);
    static readonly byte[] kstate = new byte[256];

    static bool Down(int vk) { return (GetKeyState(vk) & 0x80) != 0; }

    static string Json(string s) {
        var sb = new StringBuilder();
        foreach (char c in s) {
            if (c == '"' || c == '\\') sb.Append('\\').Append(c);
            else if (c < 32) { } // control chars never make it here (we filter on append)
            else sb.Append(c);
        }
        return sb.ToString();
    }

    static void Flush() {
        var h = GetForegroundWindow();
        var tsb = new StringBuilder(256);
        GetWindowText(h, tsb, 256);
        uint pid; GetWindowThreadProcessId(h, out pid);
        string pn = "?";
        try { pn = Process.GetProcessById((int)pid).ProcessName.ToLowerInvariant(); } catch { }
        string text = line.ToString();
        line.Clear();
        if (text.Trim().Length == 0) return;
        Console.WriteLine("{\"line\":\"" + Json(text) + "\",\"title\":\"" + Json(tsb.ToString()) + "\",\"proc\":\"" + Json(pn) + "\"}");
        Console.Out.Flush();
    }

    static IntPtr Callback(int nCode, IntPtr wParam, IntPtr lParam) {
        if (nCode >= 0 && (wParam == (IntPtr)0x0100 || wParam == (IntPtr)0x0104)) {
            var k = (KBDLLHOOKSTRUCT)Marshal.PtrToStructure(lParam, typeof(KBDLLHOOKSTRUCT));
            if (k.vk == 0x08) { if (line.Length > 0) line.Length--; }
            else if (k.vk == 0x0D) {
                // Shift+Enter = newline inside the message: soft-join and keep
                // buffering. Plain Enter = send → flush the whole line.
                if (Down(0x10)) { if (line.Length > 0 && line[line.Length - 1] != ' ') line.Append(' '); }
                else Flush();
            }
            else if (k.vk >= 0x20 && k.vk < 0xFF && !Down(0x11) && !Down(0x12)) {
                // plain typing (shift fine, ctrl/alt = shortcuts, skip)
                GetKeyboardState(kstate);
                // LL-hook timing: refresh modifier bytes from GetKeyState for accuracy
                kstate[0x10] = (byte)((GetKeyState(0x10) & 0x80) != 0 ? 0x80 : 0);
                kstate[0x11] = (byte)((GetKeyState(0x11) & 0x80) != 0 ? 0x80 : 0);
                kstate[0x12] = (byte)((GetKeyState(0x12) & 0x80) != 0 ? 0x80 : 0);
                uint dummyTid; var fh = GetForegroundWindow();
                uint tid = GetWindowThreadProcessId(fh, out dummyTid);
                var ch = new StringBuilder(8);
                int n = ToUnicodeEx(k.vk, k.sc, kstate, ch, ch.Capacity, 0, GetKeyboardLayout(tid));
                if (n > 0 && ch[0] >= 32 && ch[0] < 0xFFFD) {
                    if (line.Length < 500) line.Append(ch[0]);
                }
            }
        }
        return CallNextHookEx(hhk, nCode, wParam, lParam);
    }

    public static void Run() {
        proc = Callback;
        hhk = SetWindowsHookEx(13, proc, GetModuleHandle(null), 0);
        MSG m;
        while (GetMessage(out m, IntPtr.Zero, 0, 0) > 0) { }
        UnhookWindowsHookEx(hhk);
    }
}
'@

[KListener]::Run()
