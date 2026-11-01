# Lists the programs that start with Windows (registry Run keys + Startup folders) and whether each is enabled.
$ErrorActionPreference = 'SilentlyContinue'
[Console]::OutputEncoding = [System.Text.Encoding]::UTF8
$out = New-Object System.Collections.ArrayList

function Is-Enabled($hive, $sub, $name) {
  $p = "$hive\Software\Microsoft\Windows\CurrentVersion\Explorer\StartupApproved\$sub"
  $v = (Get-ItemProperty -Path $p -Name $name).$name
  if ($v -is [byte[]] -and $v.Length -gt 0) { return (($v[0] -band 1) -eq 0) }
  return $true
}

function Add-Run($hive, $key, $scope, $editable, $idPrefix) {
  $props = Get-ItemProperty -Path "$hive\$key"
  if (-not $props) { return }
  foreach ($pr in $props.PSObject.Properties) {
    if ($pr.Name -like 'PS*') { continue }
    [void]$out.Add(@{ id = "$idPrefix`:$($pr.Name)"; name = $pr.Name; command = [string]$pr.Value; scope = $scope; editable = $editable; enabled = (Is-Enabled $hive 'Run' $pr.Name) })
  }
}

Add-Run 'HKCU:' 'Software\Microsoft\Windows\CurrentVersion\Run' 'You' $true 'hkcu'
Add-Run 'HKLM:' 'Software\Microsoft\Windows\CurrentVersion\Run' 'All users' $false 'hklm'
Add-Run 'HKLM:' 'Software\WOW6432Node\Microsoft\Windows\CurrentVersion\Run' 'All users' $false 'hklm32'

$userStartup = [Environment]::GetFolderPath('Startup')
foreach ($f in (Get-ChildItem -Path $userStartup -File)) {
  if ($f.Name -eq 'desktop.ini') { continue }
  [void]$out.Add(@{ id = "folder:$($f.Name)"; name = $f.BaseName; command = $f.FullName; scope = 'You'; editable = $true; enabled = (Is-Enabled 'HKCU:' 'StartupFolder' $f.Name) })
}
$commonStartup = [Environment]::GetFolderPath('CommonStartup')
foreach ($f in (Get-ChildItem -Path $commonStartup -File)) {
  if ($f.Name -eq 'desktop.ini') { continue }
  [void]$out.Add(@{ id = "cfolder:$($f.Name)"; name = $f.BaseName; command = $f.FullName; scope = 'All users'; editable = $false; enabled = (Is-Enabled 'HKLM:' 'StartupFolder' $f.Name) })
}

ConvertTo-Json -Compress -InputObject @($out)
