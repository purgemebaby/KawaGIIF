# Stop hook: quality gate before Claude ends a turn. Rust changed -> cargo clippy -D warnings + cargo test; TS changed -> tsc.
# Exit 2 + stderr blocks the stop and hands the errors back to Claude. Unchanged code since the last green run is skipped.
# ASCII only in this file: PowerShell 5.1 reads BOM-less .ps1 files as ANSI.

$ErrorActionPreference = 'Continue'
[Console]::OutputEncoding = New-Object System.Text.UTF8Encoding($false)

$hook = [Console]::In.ReadToEnd() | ConvertFrom-Json
# Claude is already fixing a previous block: let it stop, never loop.
if ($hook.stop_hook_active) { exit 0 }

$root = if ($env:CLAUDE_PROJECT_DIR) { $env:CLAUDE_PROJECT_DIR } else { git rev-parse --show-toplevel }
Set-Location -LiteralPath $root
$stateDir = Join-Path $root '.claude\hooks\.state'
New-Item -ItemType Directory -Force -Path $stateDir | Out-Null

$rustPaths = @('src-tauri/src', 'src-tauri/build.rs', 'src-tauri/Cargo.toml', 'src-tauri/Cargo.lock', 'src-tauri/tauri.conf.json', 'src-tauri/capabilities')
$tsPaths = @('src', 'index.html', 'overlay.html', 'tsconfig.json', 'tsconfig.node.json', 'vite.config.ts', 'package.json')

# Content hash of the working tree (tracked + untracked, .gitignore respected) via a throwaway index.
function Get-WorkTree {
    $gitDir = git rev-parse --git-dir
    $tmp = [IO.Path]::GetTempFileName()
    Copy-Item -LiteralPath (Join-Path $gitDir 'index') -Destination $tmp -Force
    $env:GIT_INDEX_FILE = $tmp
    git add -A -- ($rustPaths + $tsPaths) 2>$null | Out-Null
    $tree = git write-tree
    Remove-Item Env:GIT_INDEX_FILE
    Remove-Item -LiteralPath $tmp -Force
    return $tree
}

function Get-Fingerprint([string]$Tree, [string[]]$Paths) { (git ls-tree $Tree -- $Paths | Out-String).Trim() }

function Read-State([string]$Name) {
    $path = Join-Path $stateDir $Name
    if (Test-Path -LiteralPath $path) { return (Get-Content -LiteralPath $path -Raw).Trim() }
    return ''
}

function Write-State([string]$Name, [string]$Value) { Set-Content -LiteralPath (Join-Path $stateDir $Name) -Value $Value -Encoding ascii }

# Runs one check; returns $null when it passes, or the useful tail of its output when it fails.
function Invoke-Check([string]$Dir, [string]$Exe, [string[]]$Arguments) {
    Push-Location -LiteralPath $Dir
    $lines = @(& $Exe @Arguments 2>&1 | ForEach-Object { "$_" })
    $code = $LASTEXITCODE
    Pop-Location
    if ($code -eq 0) { return $null }
    $useful = @($lines | Where-Object { $_ -match '^(error|warning)|: (error|warning)|-->|^\s*\d*\s*\||^test .* FAILED|panicked|test result|\.tsx?\(\d+,\d+\)' })
    if ($useful.Count -eq 0) { $useful = $lines }
    $tail = ($useful | Select-Object -Last 40) -join "`n"
    return "$Exe $($Arguments -join ' ') failed (exit $code):`n$tail"
}

$tree = Get-WorkTree
$rustPrint = Get-Fingerprint $tree $rustPaths
$tsPrint = Get-Fingerprint $tree $tsPaths
$failures = @()

if ($rustPrint -ne (Read-State 'last-green-rust')) {
    $tauri = Join-Path $root 'src-tauri'
    $fail = Invoke-Check $tauri 'cargo' @('clippy', '--all-targets', '--message-format', 'short', '--', '-D', 'warnings')
    if (-not $fail) { $fail = Invoke-Check $tauri 'cargo' @('test', '--quiet') }
    if ($fail) { $failures += $fail } else { Write-State 'last-green-rust' $rustPrint }
}

if ($tsPrint -ne (Read-State 'last-green-ts')) {
    $tsc = Join-Path $root 'node_modules\.bin\tsc.cmd'
    $fail = if (Test-Path -LiteralPath $tsc) { Invoke-Check $root $tsc @('--noEmit') } else { $null }
    if ($fail) { $failures += $fail } else { Write-State 'last-green-ts' $tsPrint }
}

if ($failures.Count -eq 0) { exit 0 }
[Console]::Error.WriteLine("Quality gate failed. Fix these before finishing:`n`n" + ($failures -join "`n`n"))
exit 2
