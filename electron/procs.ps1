# Lists every node.exe process with its command line, age and the chain of programs that started it
# (on demand, not a loop).
$ErrorActionPreference = 'SilentlyContinue'
[Console]::OutputEncoding = [System.Text.Encoding]::UTF8
$all = Get-CimInstance Win32_Process
$map = @{}
foreach ($p in $all) { $map[[int]$p.ProcessId] = @{ ppid = [int]$p.ParentProcessId; name = [string]$p.Name } }
$rows = New-Object System.Collections.ArrayList
foreach ($p in $all) {
  if ($p.Name -ne 'node.exe') { continue }
  $start = 0
  if ($p.CreationDate) { $start = [long]([DateTimeOffset]$p.CreationDate).ToUnixTimeMilliseconds() }
  # walk up: parent, grandparent, ... (stops at a parent that no longer exists)
  $chain = New-Object System.Collections.ArrayList
  $cur = [int]$p.ParentProcessId
  $broken = $false
  for ($i = 0; $i -lt 14; $i++) {
    if (-not $map.ContainsKey($cur)) { $broken = $true; break }
    [void]$chain.Add($map[$cur].name)
    $next = $map[$cur].ppid
    if ($next -eq $cur -or $next -eq 0) { break }
    $cur = $next
  }
  $cmd = [string]$p.CommandLine
  if ($cmd.Length -gt 500) { $cmd = $cmd.Substring(0, 500) }
  [void]$rows.Add(@{ pid = [int]$p.ProcessId; chain = @($chain); orphan = $broken; cmd = $cmd; ram = [long]$p.WorkingSetSize; start = $start })
}
ConvertTo-Json -Compress -Depth 4 -InputObject @($rows)
