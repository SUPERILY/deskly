param([int]$Interval = 3000, [string]$GpuFlag = '', [switch]$Once)
# Long-running sampler: one JSON line per tick with per-process CPU/RAM (aggregated by program),
# GPU use per process (every 3rd tick) and the dev servers that are listening on a port.
$ErrorActionPreference = 'SilentlyContinue'
[Console]::OutputEncoding = [System.Text.Encoding]::UTF8
$cores = [Environment]::ProcessorCount
$prev = @{}
$prevT = [DateTime]::UtcNow
$tick = 0
$gpuByPid = @{}
$devNames = @('node','python','pythonw','python3','bun','deno','php','ruby','java','dotnet','go','uvicorn','gunicorn','nginx','caddy','http-server','npm','npx','pnpm','yarn','vite','next','cargo','hugo','jekyll','rails','flask','streamlit','jupyter-lab','jupyter-notebook')
$skipCmd = '(vscode|\.vscode|antigravity|cursor|claude|electron|language-server|tsserver|typingsInstaller|extensionHost|resources\\app|windsurf|figma|discord|ms-playwright|chrome-devtools)'
$cmdCache = @{}   # pid -> @{ cmd; start } (a command line never changes while the process lives)

while ($true) {
  $t0 = [DateTime]::UtcNow
  $dt = [Math]::Max(0.5, ($t0 - $prevT).TotalSeconds)
  $prevT = $t0
  $procs = Get-Process
  $byId = @{}
  $cur = @{}
  $agg = @{}
  foreach ($p in $procs) {
    $id = $p.Id
    $byId[$id] = $p
    $c = $p.CPU
    $cur[$id] = $c
    $d = 0.0
    if ($c -ne $null -and $prev.ContainsKey($id) -and $prev[$id] -ne $null) { $d = ($c - $prev[$id]) / $dt / $cores * 100 }
    if ($d -lt 0) { $d = 0.0 }
    $n = $p.ProcessName
    if (-not $agg.ContainsKey($n)) { $agg[$n] = @{ name = $n; cpu = 0.0; ram = [long]0; count = 0; pids = New-Object System.Collections.ArrayList } }
    $a = $agg[$n]
    $a.cpu += $d
    $a.ram += [long]$p.WorkingSet64
    $a.count += 1
    [void]$a.pids.Add($id)
  }
  $prev = $cur

  # GPU per process. The counter set costs ~2s of CPU, so it only runs while the Performance page
  # is open (Deskly creates the flag file) and only every 3rd tick.
  if ($GpuFlag -ne '' -and (Test-Path $GpuFlag)) {
    if ($tick % 3 -eq 0) {
    $g = @{}
    $samples = (Get-Counter '\GPU Engine(*)\Utilization Percentage').CounterSamples
    foreach ($s in $samples) {
      if ($s.InstanceName -match 'pid_(\d+)_') {
        $gp = [int]$matches[1]
        if (-not $g.ContainsKey($gp) -or $s.CookedValue -gt $g[$gp]) { $g[$gp] = [double]$s.CookedValue }
      }
    }
    $gpuByPid = $g
    }
  } else { $gpuByPid = @{} }
  $gpuAgg = @{}
  foreach ($k in $gpuByPid.Keys) {
    if ($byId.ContainsKey([int]$k)) {
      $nm = $byId[[int]$k].ProcessName
      if (-not $gpuAgg.ContainsKey($nm)) { $gpuAgg[$nm] = @{ name = $nm; gpu = 0.0; pids = New-Object System.Collections.ArrayList } }
      $gpuAgg[$nm].gpu = [Math]::Min(100.0, $gpuAgg[$nm].gpu + $gpuByPid[$k])
      [void]$gpuAgg[$nm].pids.Add([int]$k)
    }
  }

  $all = @($agg.Values)
  $cpuTop = @($all | Sort-Object { $_.cpu } -Descending | Select-Object -First 8 | ForEach-Object { @{ name = $_.name; cpu = [Math]::Round($_.cpu, 1); ram = $_.ram; count = $_.count; pids = @($_.pids) } })
  $ramTop = @($all | Sort-Object { $_.ram } -Descending | Select-Object -First 8 | ForEach-Object { @{ name = $_.name; cpu = [Math]::Round($_.cpu, 1); ram = $_.ram; count = $_.count; pids = @($_.pids) } })
  $gpuTop = @($gpuAgg.Values | Where-Object { $_.gpu -ge 0.5 } | Sort-Object { $_.gpu } -Descending | Select-Object -First 6 | ForEach-Object { @{ name = $_.name; gpu = [Math]::Round($_.gpu, 1); pids = @($_.pids) } })

  # dev servers: listening ports owned by dev-ish programs (sampled every 2nd tick to conserve CPU)
  if ($tick % 2 -eq 0 -or $serversCached -eq $null) {
    $servers = New-Object System.Collections.ArrayList
    $seen = @{}
    # `netstat` is ~20x cheaper than Get-NetTCPConnection and also lists IPv6 listeners
    foreach ($line in (netstat -ano | Select-String 'LISTENING')) {
      $f = ($line.ToString().Trim() -split '\s+')
      if ($f.Count -lt 5 -or $f[0] -ne 'TCP') { continue }
      $port = [int]($f[1].Substring($f[1].LastIndexOf(':') + 1))
      $ownerPid = [int]$f[4]
      if ($port -lt 1024 -and $port -ne 80) { continue }
      $key = "$ownerPid`:$port"
      if ($seen.ContainsKey($key)) { continue }
      $seen[$key] = $true
      if (-not $byId.ContainsKey($ownerPid)) { continue }
      $pn = $byId[$ownerPid].ProcessName
      if ($devNames -notcontains $pn.ToLower()) { continue }
      if (-not $cmdCache.ContainsKey($ownerPid)) {
        $ci = Get-CimInstance Win32_Process -Filter "ProcessId=$ownerPid"
        $sm = 0
        if ($ci.CreationDate) { $sm = [long]([DateTimeOffset]$ci.CreationDate).ToUnixTimeMilliseconds() }
        $cmdCache[$ownerPid] = @{ cmd = [string]$ci.CommandLine; start = $sm }
      }
      $cmd = $cmdCache[$ownerPid].cmd
      if ($cmd -match $skipCmd) { continue }
      [void]$servers.Add(@{ port = $port; pid = $ownerPid; name = $pn; cmd = $(if ($cmd.Length -gt 400) { $cmd.Substring(0, 400) } else { $cmd }); start = $cmdCache[$ownerPid].start; ram = [long]$byId[$ownerPid].WorkingSet64 })
    }
    $serversCached = @($servers)
  }
  if ($cmdCache.Count -gt 200) { $cmdCache = @{} }

  $out = @{ first = ($tick -eq 0); cpu = $cpuTop; ram = $ramTop; gpu = $gpuTop; servers = $serversCached; procCount = $procs.Count }
  [Console]::Out.WriteLine(($out | ConvertTo-Json -Compress -Depth 6))
  [Console]::Out.Flush()
  if ($Once) { break }
  $tick++
  $spent = ([DateTime]::UtcNow - $t0).TotalMilliseconds
  Start-Sleep -Milliseconds ([Math]::Max(200, $Interval - $spent))
}
