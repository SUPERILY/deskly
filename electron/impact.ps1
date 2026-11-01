# What every running program has cost since Windows started: CPU seconds, memory, and when it started.
# Used to estimate how heavy each startup entry is. Read-only.
$ErrorActionPreference = 'SilentlyContinue'
[Console]::OutputEncoding = [System.Text.Encoding]::UTF8
$boot = (Get-CimInstance Win32_OperatingSystem).LastBootUpTime
$rows = New-Object System.Collections.ArrayList
foreach ($p in (Get-Process)) {
  $path = $null; $start = $null
  try { $path = $p.Path } catch {}
  try { $start = $p.StartTime.ToUniversalTime().ToString('o') } catch {}
  [void]$rows.Add(@{ n = $p.ProcessName; p = $path; ws = [long]$p.WorkingSet64; cpu = [Math]::Round([double]$p.CPU, 1); st = $start })
}
$bootIso = $null
if ($boot) { $bootIso = ([DateTime]$boot).ToUniversalTime().ToString('o') }
ConvertTo-Json -Compress -Depth 4 -InputObject @{ boot = $bootIso; procs = @($rows) }
