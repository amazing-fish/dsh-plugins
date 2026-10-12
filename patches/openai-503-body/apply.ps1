#Requires -Version 5.1
<#
.SYNOPSIS
    Re-apply the openai 503-body message patch to a local @deepseek-ai/dsh install.

.DESCRIPTION
    DSH bundles the JS OpenAI SDK. When an upstream provider answers 503 with a
    non-standard queue body `{code, message}` (no `error` wrapper), the SDK
    drops the body message and DSH shows "503 status code (no body)" instead of
    the queue notice. This script inserts a small fallback into
    openai/core/error.mjs (ESM runtime path) and error.js (CJS, belt-and-braces).

    Idempotent: skips files that already carry the patch marker. Anchored by
    text, so it tolerates minor openai version drift (tested against
    openai@6.26.0 / @deepseek-ai/dsh 0.1.1-rc.2).

    After applying, RESTART the DSH process — ESM modules are cached per
    process and the running process keeps the old code until restart.

.PARAMETER DshRoot
    Path to the @deepseek-ai/dsh package root. Auto-detected from
    `npm root -g` and %USERPROFILE%\npm-global when omitted.

.EXAMPLE
    ./apply.ps1
    ./apply.ps1 -DshRoot "C:\Users\me\npm-global\node_modules\@deepseek-ai\dsh"
#>
param(
    [string]$DshRoot = ""
)

$ErrorActionPreference = "Stop"

$marker      = "errorResponse?.['message']"
$anchor      = "const error = errorResponse?.['error'];"
$insertLines = @(
    "        if (!error && typeof errorResponse?.['message'] === 'string' && errorResponse['message'].length > 0) {",
    "            message = errorResponse['message'];",
    "        }"
)

function Resolve-DshRoot {
    if ($DshRoot) { return $DshRoot }
    $candidates = @()
    try {
        $npmRoot = (& npm root -g 2>$null)
        if ($npmRoot) { $candidates += (Join-Path $npmRoot "@deepseek-ai\dsh") }
    } catch { }
    $candidates += (Join-Path $HOME "npm-global\node_modules\@deepseek-ai\dsh")
    foreach ($c in $candidates) {
        if (Test-Path (Join-Path $c "package.json")) { return $c }
    }
    throw "Could not locate the @deepseek-ai/dsh install. Pass -DshRoot explicitly."
}

function Add-BodyMessagePatch {
    param([string]$File)
    $text = [System.IO.File]::ReadAllText($File)
    if ($text.Contains($marker)) {
        Write-Host "  SKIP (already patched): $File"
        return $false
    }
    $idx = $text.IndexOf($anchor, [System.StringComparison]::Ordinal)
    if ($idx -lt 0) {
        throw "anchor not found in $File — openai's generate() may have changed. Inspect manually against openai-error-503-body.patch."
    }
    $insertPos = $idx + $anchor.Length
    $newline = if ($text.Contains("`r`n")) { "`r`n" } else { "`n" }
    $patched = $text.Substring(0, $insertPos) + $newline + ($insertLines -join $newline) + $text.Substring($insertPos)
    [System.IO.File]::WriteAllText($File, $patched, (New-Object System.Text.UTF8Encoding($false)))
    Write-Host "  PATCHED: $File"
    return $true
}

$root = Resolve-DshRoot
Write-Host "DSH root: $root"
$core = Join-Path $root "node_modules\openai\core"
if (-not (Test-Path $core)) {
    throw "openai/core not found under $root — dsh layout may have changed."
}

$changed = @()
foreach ($name in @("error.mjs", "error.js")) {
    $f = Join-Path $core $name
    if (-not (Test-Path $f)) { Write-Warning "  missing (skipped): $f"; continue }
    if (Add-BodyMessagePatch -File $f) { $changed += $f }
}

foreach ($f in $changed) {
    $null = & node --check $f 2>&1
    if ($LASTEXITCODE -ne 0) {
        throw "node --check FAILED for ${f} — restore from the package and inspect."
    }
    Write-Host "  node --check OK: $f"
}

if ($changed.Count -gt 0) {
    Write-Host ""
    Write-Host "Patch applied. RESTART the DSH process to take effect (ESM module cache)."
} else {
    Write-Host ""
    Write-Host "Nothing to do — patch already present on all target files."
}
