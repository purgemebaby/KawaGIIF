# PostToolUse hook: formats the file Claude just edited. .rs -> nightly rustfmt (only if src-tauri/rustfmt.toml exists),
# .ts/.tsx/.css -> the project's prettier (only if installed). Never blocks: always exit 0.
# ASCII only in this file: PowerShell 5.1 reads BOM-less .ps1 files as ANSI.

$ErrorActionPreference = 'Continue'

$hook = [Console]::In.ReadToEnd() | ConvertFrom-Json
$file = $hook.tool_input.file_path
if (-not $file -or -not (Test-Path -LiteralPath $file -PathType Leaf)) { exit 0 }

$root = if ($env:CLAUDE_PROJECT_DIR) { $env:CLAUDE_PROJECT_DIR } else { git rev-parse --show-toplevel }
$full = [IO.Path]::GetFullPath($file)
$rootFull = [IO.Path]::GetFullPath($root).TrimEnd('\') + '\'
# Only files of this repo, never generated or vendored ones.
if (-not $full.StartsWith($rootFull, [StringComparison]::OrdinalIgnoreCase)) { exit 0 }
if ($full -match '\\(node_modules|dist|target|gen)\\') { exit 0 }

switch ([IO.Path]::GetExtension($full).ToLower()) {
    '.rs' {
        $toml = Join-Path $root 'src-tauri\rustfmt.toml'
        if (Test-Path -LiteralPath $toml) { rustup run nightly rustfmt --edition 2021 --config-path $toml $full 2>&1 | Out-Null }
    }
    { $_ -in '.ts', '.tsx', '.css' } {
        $prettier = Join-Path $root 'node_modules\.bin\prettier.cmd'
        if (Test-Path -LiteralPath $prettier) { & $prettier --write --log-level warn $full 2>&1 | Out-Null }
    }
}
exit 0
