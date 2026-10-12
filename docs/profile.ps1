# Memory scenarios for docs/profiling.md. Runs the release exe with several templates and prints private / working-set MB
# per process role. Backs up and restores template.json and config.toml. Close any running KawaGiif first.
param([string]$Exe = (Join-Path $PSScriptRoot '..\src-tauri\target\release\kawagiif.exe'), [int]$Settle = 20, [int]$LeakMinutes = 5)

$data = Join-Path $env:LOCALAPPDATA 'KawaGiif'
$bak = Join-Path $env:TEMP 'kawagiif-profile-backup'
New-Item -ItemType Directory -Force $bak | Out-Null
Copy-Item (Join-Path $data 'template.json') $bak -Force
Copy-Item (Join-Path $data 'config.toml') $bak -Force

$tpl = Get-Content (Join-Path $bak 'template.json') -Raw | ConvertFrom-Json
$cfg = Get-Content (Join-Path $bak 'config.toml') -Raw

function Get-Tree([int]$root) {
    $all = Get-CimInstance Win32_Process | Select-Object ProcessId, ParentProcessId, Name, WorkingSetSize, PrivatePageCount, CommandLine
    $fam = @{ $root = $true }
    do { $b = $fam.Count; foreach ($p in $all) { if ($fam.ContainsKey([int]$p.ParentProcessId)) { $fam[[int]$p.ProcessId] = $true } } } while ($fam.Count -ne $b)
    $all | Where-Object { $fam.ContainsKey([int]$_.ProcessId) }
}

function Role($p) {
    if ($p.Name -eq 'kawagiif.exe') { return 'host (Rust)' }
    if ($p.CommandLine -match '--type=renderer') { return 'renderer' }
    if ($p.CommandLine -match '--type=gpu-process') { return 'gpu' }
    if ($p.CommandLine -match '--utility-sub-type=([\w.]+)') { return 'utility ' + ($matches[1] -replace '\.mojom\..*', '') }
    if ($p.CommandLine -match '--type=([\w-]+)') { return $matches[1] }
    return 'browser'
}

function Snapshot([string]$name, $proc) {
    $tree = Get-Tree $proc.Id
    $rows = $tree | ForEach-Object { [pscustomobject]@{ Scenario = $name; Role = Role $_; WS = [math]::Round($_.WorkingSetSize / 1MB); Priv = [math]::Round($_.PrivatePageCount / 1MB) } }
    "`n=== $name : {0} processes, WS {1} MB, Private {2} MB ===" -f $rows.Count, ($rows | Measure-Object WS -Sum).Sum, ($rows | Measure-Object Priv -Sum).Sum
    $rows | Sort-Object Priv -Descending | Format-Table Role, WS, Priv -AutoSize | Out-String
}

function Run([string]$name, $items, [bool]$hidden, [int]$extraWaitSec = 0) {
    $t = [pscustomobject]@{ items = @($items) }
    $t | ConvertTo-Json -Depth 5 | ForEach-Object { [IO.File]::WriteAllText((Join-Path $data 'template.json'), $_) }
    $c = $cfg -replace 'start_minimized_to_tray = \w+', "start_minimized_to_tray = $($hidden.ToString().ToLower())"
    [IO.File]::WriteAllText((Join-Path $data 'config.toml'), $c)
    $p = Start-Process $Exe -PassThru
    Start-Sleep -Seconds $Settle
    Snapshot $name $p
    if ($extraWaitSec -gt 0) { Start-Sleep -Seconds $extraWaitSec; Snapshot "$name (+$extraWaitSec s)" $p }
    Get-Tree $p.Id | ForEach-Object { Stop-Process -Id $_.ProcessId -Force -ErrorAction SilentlyContinue }
    Start-Sleep -Seconds 3
}

try {
    $all = @($tpl.items)
    $first = @($all | Select-Object -First 1)
    Run 'S1 0 overlays, control shown' @() $false
    Run 'S2 0 overlays, control in tray' @() $true
    Run 'S3 1 overlay, control in tray' $first $true
    Run "S4 $($all.Count) overlays (saved template), control in tray" $all $true
    Run "S5 $($all.Count) overlays, control shown" $all $false ($LeakMinutes * 60)
}
finally {
    Copy-Item (Join-Path $bak 'template.json') $data -Force
    Copy-Item (Join-Path $bak 'config.toml') $data -Force
    "`nRestored template.json and config.toml"
}
