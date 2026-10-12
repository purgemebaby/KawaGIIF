# PreToolUse hook for kg-reviewer: only read-only and verification commands may run through Bash.
# Every segment of a chained command must match the allow-list; anything else is blocked with exit 2.
# ASCII only in this file: PowerShell 5.1 reads BOM-less .ps1 files as ANSI.

$ErrorActionPreference = 'Continue'

$hook = [Console]::In.ReadToEnd() | ConvertFrom-Json
$command = [string]$hook.tool_input.command
if (-not $command) { exit 0 }

function Block([string]$Why) {
    [Console]::Error.WriteLine("kg-reviewer is read-only: $Why. Allowed: cargo clippy/test/check/tree, git diff/status/log/show/ls-files/rev-parse/blame, npx tsc --noEmit, rg/grep/ls/cat/head/tail/wc/sort/uniq/sed -n/cd/pwd/echo.")
    exit 2
}

# Redirects to files, command substitution and process substitution could write or hide anything.
$scrubbed = $command -replace '2>&1', '' -replace '[12]?>\s*/dev/null', ''
if ($scrubbed -match '>|`|\$\(|<\(') { Block 'redirects and command substitution are not allowed' }

$allowed = @(
    '^cargo\s+(clippy|test|check|tree)\b',
    '^git\s+(diff|status|log|show|ls-files|rev-parse|blame)\b',
    '^(npx\s+tsc|node_modules/\.bin/tsc(\.cmd)?)\s+--noEmit\b',
    '^(rg|grep|ls|cat|head|tail|wc|sort|uniq|pwd|echo)\b',
    '^sed\s+-n\b(?!.*\s-i)',
    '^cd\s'
)

foreach ($segment in ($command -split '&&|\|\||;|\|')) {
    $s = $segment.Trim()
    if (-not $s) { continue }
    if ($s -match '\s-(delete|exec)\b|--in-place|--fix|--write') { Block "'$s' modifies files" }
    $ok = $false
    foreach ($rule in $allowed) { if ($s -match $rule) { $ok = $true; break } }
    if (-not $ok) { Block "'$s' is not on the allow-list" }
}
exit 0
