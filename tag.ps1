#requires -version 5.0
<#
.SYNOPSIS
    Git tag creation script for Obsidian plugin releases.

.DESCRIPTION
    Creates a Git tag and pushes it to the remote (origin). Local and remote
    are always handled together. By default the script lists local and remote
    tags first and waits for confirmation. With -Force it skips the listing
    and confirmation, going straight to the core actions.

    NOTE: Obsidian rejects v-prefixed tags. Use pure semver (e.g. 0.1.0).
    Append -test or -debug for dry runs that build but skip publishing the
    GitHub Release (see .github/workflows/release.yml).

.PARAMETER Tag
    Tag name in semver form, e.g. 0.1.0 (no `v` prefix).

.PARAMETER Force
    Skip listing and confirmation; run the core actions directly.

.EXAMPLE
    .\tag.ps1 -Tag '0.1.0'

.EXAMPLE
    .\tag.ps1 -Tag '0.1.0-test' -Force
#>

param(
    [Parameter(Mandatory=$true, Position=0)]
    [string]$Tag,

    [Parameter(Mandatory=$false)]
    [switch]$Force
)

$ErrorActionPreference = 'Stop'
$Remote = 'origin'

# ============================================================================
# Pre-flight: enforce Obsidian's no-v-prefix rule.
# ============================================================================

if ($Tag -match '^v') {
    Write-Host "ABORT: Obsidian rejects v-prefixed tags. Use pure semver, e.g. '0.1.0'." -ForegroundColor Red
    return
}
if ($Tag -notmatch '^\d+\.\d+\.\d+(-[\w\.]+)?$') {
    Write-Host "ABORT: tag '$Tag' is not valid semver (expected '0.1.0' or '0.1.0-test')." -ForegroundColor Red
    return
}

# ============================================================================
# Functions
# ============================================================================

function Show-LocalTags {
    param([string[]]$Tags)
    Write-Host "`n[Local tags]" -ForegroundColor Yellow
    if ($Tags) { $Tags | ForEach-Object { Write-Host "  $_" } }
    else { Write-Host "  (none)" -ForegroundColor DarkGray }
}

function Show-RemoteTags {
    param([string]$RemoteName, [string[]]$Tags)
    Write-Host "`n[Remote tags] ($RemoteName)" -ForegroundColor Yellow
    if ($Tags) { $Tags | ForEach-Object { Write-Host "  $_" } }
    else { Write-Host "  (none)" -ForegroundColor DarkGray }
}

function New-GitTag {
    param([string]$TagName, [string]$Message)

    Write-Host "`n>> Creating local tag: $TagName" -ForegroundColor Cyan
    git tag -a $TagName -m $Message
    if ($LASTEXITCODE -eq 0) {
        Write-Host "OK: local tag created" -ForegroundColor Green
        return $true
    }
    Write-Host "FAIL: local tag creation failed" -ForegroundColor Red
    return $false
}

function Push-GitTag {
    param([string]$TagName, [string]$RemoteName)

    Write-Host ">> Pushing tag to remote: $RemoteName/$TagName" -ForegroundColor Cyan
    git push $RemoteName $TagName
    if ($LASTEXITCODE -eq 0) {
        Write-Host "OK: push succeeded" -ForegroundColor Green
        return $true
    }
    Write-Host "FAIL: push failed; you can re-run this script to retry" -ForegroundColor Red
    return $false
}

function Get-LocalTags {
    $tags = git tag
    if ($LASTEXITCODE -ne 0) { return @() }
    return @($tags | Where-Object { $_ -and $_.Trim() })
}

function Get-RemoteTags {
    param([string]$RemoteName)
    $raw = git ls-remote --tags $RemoteName 2>$null
    if ($LASTEXITCODE -ne 0) { return @() }
    return @($raw |
        ForEach-Object { ($_ -split '\s+')[1] } |
        Where-Object { $_ -and $_ -notmatch '\^\{\}$' } |
        ForEach-Object { $_ -replace '^refs/tags/', '' })
}

# ============================================================================
# Main
# ============================================================================

Write-Host "========================================" -ForegroundColor Blue
Write-Host "             Git Tag Create            " -ForegroundColor Blue
Write-Host "========================================" -ForegroundColor Blue

Write-Host "`nTarget tag: $Tag (local + remote)" -ForegroundColor Cyan

if ($Force) {
    # Fast path: skip listing and confirmation, run core actions directly.
    Write-Host "-Force enabled: skipping tag listing and confirmation" -ForegroundColor DarkGray

    Write-Host "`n>> Creating local tag: $Tag" -ForegroundColor Cyan
    git tag -a $Tag -m "Release $Tag" 2>&1 | ForEach-Object { Write-Host $_ }
    if ($LASTEXITCODE -eq 0) {
        Write-Host "OK: local tag created" -ForegroundColor Green
    } else {
        Write-Host "INFO: local creation did not succeed (may already exist); continuing with push" -ForegroundColor DarkGray
    }

    if (-not (Push-GitTag -TagName $Tag -RemoteName $Remote)) {
        Write-Host "`nWARN: remote push did not succeed. Re-run the script to retry:" -ForegroundColor Yellow
        Write-Host "  .\tag.ps1 -Tag $Tag" -ForegroundColor Yellow
    }

    Write-Host "`nDone." -ForegroundColor Green
    return
}

# Interactive mode: read current state and display.
$localTags  = Get-LocalTags
$remoteTags = Get-RemoteTags -RemoteName $Remote

Show-LocalTags -Tags $localTags
Show-RemoteTags -RemoteName $Remote -Tags $remoteTags

$inLocal  = $localTags  -contains $Tag
$inRemote = $remoteTags -contains $Tag

# Idempotent short-circuit.
if ($inLocal -and $inRemote) {
    Write-Host "`nOK: tag '$Tag' already exists locally and remotely; nothing to do" -ForegroundColor Green
    return
}

# Show planned actions.
Write-Host "`nPlanned actions:" -ForegroundColor Cyan
if (-not $inLocal)  { Write-Host "  - Create local tag $Tag" }
else                { Write-Host "  - Local tag $Tag already exists; skip local creation" -ForegroundColor DarkGray }
if (-not $inRemote) { Write-Host "  - Push tag to $Remote" }

# Confirm.
$confirm = Read-Host "`nProceed? (y/N)"
if ($confirm -notmatch '^[yY]') {
    Write-Host "Cancelled" -ForegroundColor Yellow
    return
}

# Create local tag only if missing.
if (-not $inLocal) {
    if (-not (New-GitTag -TagName $Tag -Message "Release $Tag")) {
        Write-Host "`nABORT: local creation failed" -ForegroundColor Red
        return
    }
} else {
    Write-Host "`nINFO: local tag exists; skipping creation. Run tag-del.ps1 first if you need to recreate." -ForegroundColor DarkGray
}

# Push to remote.
if (-not (Push-GitTag -TagName $Tag -RemoteName $Remote)) {
    Write-Host "`nWARN: local tag is ready but the remote push did not succeed. Re-run the script to push only:" -ForegroundColor Yellow
    Write-Host "  .\tag.ps1 -Tag $Tag" -ForegroundColor Yellow
}

Write-Host "`nDone." -ForegroundColor Green
