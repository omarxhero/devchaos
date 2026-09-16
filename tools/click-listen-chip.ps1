# Click the DevChaos overlay's listen chip (top-right, left of the skull chip)
# via real mouse events — reproduces a human click on the transparent overlay.
Add-Type @'
using System;
using System.Text;
using System.Runtime.InteropServices;
public class MouseClick {
  public delegate bool EnumProc(IntPtr h, IntPtr l);
  [DllImport("user32.dll")] public static extern bool EnumWindows(EnumProc cb, IntPtr l);
  [DllImport("user32.dll")] public static extern int GetWindowText(IntPtr h, StringBuilder s, int n);
  [DllImport("user32.dll")] public static extern bool IsWindowVisible(IntPtr h);
  [DllImport("user32.dll")] public static extern bool SetForegroundWindow(IntPtr h);
  [DllImport("user32.dll")] public static extern bool SetCursorPos(int x, int y);
  [DllImport("user32.dll")] public static extern void mouse_event(uint flags, int dx, int dy, uint data, UIntPtr extra);
  public const uint LEFTDOWN = 0x02, LEFTUP = 0x04;
  public static IntPtr found = IntPtr.Zero;
  public static bool CB(IntPtr h, IntPtr l) {
    var sb = new StringBuilder(256);
    GetWindowText(h, sb, 256);
    if (IsWindowVisible(h) && sb.ToString() == "DevChaos") { found = h; return false; }
    return true;
  }
  public static IntPtr Find() { found = IntPtr.Zero; EnumWindows(CB, IntPtr.Zero); return found; }
}
'@

$h = [MouseClick]::Find()
if ($h -eq [IntPtr]::Zero) { Write-Output "WINDOW-NOT-FOUND"; exit 1 }
[MouseClick]::SetForegroundWindow($h) | Out-Null
Start-Sleep -Milliseconds 500
# chip center ~ (1662, 28) on the 1920x1080 primary screen
[MouseClick]::SetCursorPos(1662, 28) | Out-Null
Start-Sleep -Milliseconds 150
[MouseClick]::mouse_event([MouseClick]::LEFTDOWN, 0, 0, 0, [UIntPtr]::Zero)
Start-Sleep -Milliseconds 60
[MouseClick]::mouse_event([MouseClick]::LEFTUP, 0, 0, 0, [UIntPtr]::Zero)
Write-Output "CLICKED"
