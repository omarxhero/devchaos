$ErrorActionPreference = 'Stop'
$source = Get-Content -Raw (Join-Path $PSScriptRoot '../tools/ide-listener.ps1')
$code = [regex]::Match($source, '(?s)using System;.*?(?=\r?\n}\r?\n)').Value + "`n}"
# Compile only: never invoke Run, install hooks, or inspect real foreground state.
Add-Type -TypeDefinition $code
$flags = [Reflection.BindingFlags]'NonPublic,Static'
$t = [KListener]
$reset = $t.GetMethod('ResetContext', $flags)
$focus = $t.GetMethod('ForegroundChanged', $flags)
$line = $t.GetField('line', $flags).GetValue($null)
$null = $reset.Invoke($null, @([IntPtr]1, 'outside'))
$null = $line.Append('synthetic private marker')
$null = $reset.Invoke($null, @([IntPtr]2, 'IDE'))
if ($line.Length -ne 0) { throw 'Cross-window buffer retained' }
$null = $line.Append('synthetic IDE prompt')
$null = $reset.Invoke($null, @([IntPtr]2, 'IDE'))
if ($line.ToString() -ne 'synthetic IDE prompt') { throw 'Same-context buffer lost' }
$null = $reset.Invoke($null, @([IntPtr]2, 'other tab'))
if ($line.Length -ne 0) { throw 'Title-change buffer retained' }
$null = $line.Append('synthetic return marker')
$null = $focus.Invoke($null, @([IntPtr]0, [uint32]3, [IntPtr]3, 0, 0, [uint32]0, [uint32]0))
$null = $reset.Invoke($null, @([IntPtr]2, 'other tab'))
if ($line.Length -ne 0) { throw 'Focus-away-and-return buffer retained' }
if ($source -notmatch 'focusHook = SetWinEventHook\(3, 3,' -or $source -notmatch 'UnhookWinEvent\(focusHook\)') { throw 'Focus reset hook lifecycle missing' }
Write-Output 'PASS: actual C# compiled; synthetic window, title, focus-away-and-return resets; same-context preservation. No live hook installed.'
