# E2E helper v3: find window by title substring via EnumWindows, focus it, type.
Add-Type -AssemblyName System.Windows.Forms
Add-Type @'
using System;
using System.Text;
using System.Runtime.InteropServices;
public class WFind {
  public delegate bool EnumProc(IntPtr h, IntPtr l);
  [DllImport("user32.dll")] public static extern bool EnumWindows(EnumProc cb, IntPtr l);
  [DllImport("user32.dll")] public static extern int GetWindowText(IntPtr h, StringBuilder s, int n);
  [DllImport("user32.dll")] public static extern bool IsWindowVisible(IntPtr h);
  [DllImport("user32.dll")] public static extern bool SetForegroundWindow(IntPtr h);
  public static IntPtr found = IntPtr.Zero;
  public static bool CB(IntPtr h, IntPtr l) {
    var sb = new StringBuilder(256);
    GetWindowText(h, sb, 256);
    if (IsWindowVisible(h) && sb.ToString().IndexOf("Visual Studio Code-test", StringComparison.OrdinalIgnoreCase) >= 0) {
      found = h; return false;
    }
    return true;
  }
  public static IntPtr Find() { found = IntPtr.Zero; EnumWindows(CB, IntPtr.Zero); return found; }
}
'@

$f = "C:\Users\Omarc\devchaos\shots\Visual Studio Code-test.txt"
if (-not (Test-Path $f)) { New-Item -ItemType File -Path $f | Out-Null }
if ([WFind]::Find() -eq [IntPtr]::Zero) {
  Start-Process notepad -ArgumentList "`"$f`""
  Start-Sleep -Milliseconds 2500
}

$h = [WFind]::Find()
if ($h -eq [IntPtr]::Zero) { Write-Output "WINDOW-NOT-FOUND"; exit 1 }
[WFind]::SetForegroundWindow($h) | Out-Null
Start-Sleep -Milliseconds 700

[System.Windows.Forms.SendKeys]::SendWait("hi now we will work on big project{ENTER}")
Start-Sleep -Milliseconds 400
[System.Windows.Forms.SendKeys]::SendWait("const x = 5;{ENTER}")
Start-Sleep -Milliseconds 400
Write-Output "SENT"
