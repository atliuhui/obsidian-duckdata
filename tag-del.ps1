#requires -version 5.0
<#
.SYNOPSIS
    Git tag delete script for Obsidian plugin releases.

.DESCRIPTION
    Deletes a Git tag locally and on the remote (origin). By default the
    script lists local and remote tags first and waits for confirmation.
    With -Force it skips the listing and confirmation, going straight to
    the core actions.

    Use this to clean up failed/dry-run tags. Note: deleting a tag does NOT
    delete the corresponding GitHub Release if one was already created — go
    delete that manually from the Releases page.

.PARAMETER Tag
    Tag name to delete, e.g. 0.1.0 or 0.1.0-test (no `v` prefix).

.PARAMETER Force
    Skip listing and confirmation; run the core actions directly.

.EXAMPLE
    .\tag-del.ps1 -Tag '0.1.0'

.EXAMPLE
    .\tag-del.ps1 -Tag '0.1.0-test' -Force
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
# Functions
# ============================================================================

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

function Show-Tags {
    param([string]$Title, [string[]]$Tags)
    Write-Host "`n$Title" -ForegroundColor Yellow
    if ($Tags -and $Tags.Count -gt 0) {
        $Tags | ForEach-Object { Write-Host "  $_" }
    } else {
        Write-Host "  (none)" -ForegroundColor DarkGray
    }
}

function Remove-LocalTag {
    param([string]$TagName)
    Write-Host "`n>> Deleting local tag: $TagName" -ForegroundColor Cyan
    git tag -d $TagName
    if ($LASTEXITCODE -eq 0) {
        Write-Host "OK: local tag deleted" -ForegroundColor Green
        return $true
    }
    Write-Host "FAIL: local delete failed" -ForegroundColor Red
    return $false
}

function Remove-RemoteTag {
    param([string]$TagName, [string]$RemoteName)
    Write-Host ">> Deleting remote tag: $RemoteName/$TagName" -ForegroundColor Cyan
    git push $RemoteName --delete $TagName
    if ($LASTEXITCODE -eq 0) {
        Write-Host "OK: remote tag deleted" -ForegroundColor Green
        return $true
    }
    Write-Host "FAIL: remote delete failed; you can re-run this script to retry" -ForegroundColor Red
    return $false
}

# ============================================================================
# Main
# ============================================================================

Write-Host "========================================" -ForegroundColor Blue
Write-Host "             Git Tag Delete            " -ForegroundColor Blue
Write-Host "========================================" -ForegroundColor Blue

Write-Host "`nTarget tag: $Tag (local + remote)" -ForegroundColor Cyan

if ($Force) {
    # Fast path: skip listing and confirmation, run core actions directly.
    Write-Host "-Force enabled: skipping tag listing and confirmation" -ForegroundColor DarkGray

    Write-Host "`n>> Deleting local tag: $Tag" -ForegroundColor Cyan
    git tag -d $Tag 2>&1 | ForEach-Object { Write-Host $_ }
    if ($LASTEXITCODE -eq 0) {
        Write-Host "OK: local tag deleted" -ForegroundColor Green
    } else {
        Write-Host "INFO: local delete did not succeed (may not exist); continuing with remote delete" -ForegroundColor DarkGray
    }

    if (-not (Remove-RemoteTag -TagName $Tag -RemoteName $Remote)) {
        Write-Host "`nWARN: remote delete did not succeed. Re-run the script to retry:" -ForegroundColor Yellow
        Write-Host "  .\tag-del.ps1 -Tag $Tag" -ForegroundColor Yellow
    }

    Write-Host "`nDone." -ForegroundColor Green
    return
}

# Interactive mode: list current tags.
$localTags  = Get-LocalTags
$remoteTags = Get-RemoteTags -RemoteName $Remote

Show-Tags -Title '[Local tags]' -Tags $localTags
Show-Tags -Title "[Remote tags] ($Remote)" -Tags $remoteTags

$inLocal  = $localTags  -contains $Tag
$inRemote = $remoteTags -contains $Tag

if (-not $inLocal -and -not $inRemote) {
    Write-Host "`nOK: tag '$Tag' does not exist locally or remotely; nothing to do" -ForegroundColor Green
    return
}

# Show planned actions.
Write-Host "`nPlanned actions:" -ForegroundColor Cyan
if ($inLocal)  { Write-Host "  - Delete local tag $Tag" }
else           { Write-Host "  - Local tag $Tag does not exist; skip local delete" -ForegroundColor DarkGray }
if ($inRemote) { Write-Host "  - Delete remote tag $Remote/$Tag" }
else           { Write-Host "  - Remote tag $Remote/$Tag does not exist; skip remote delete" -ForegroundColor DarkGray }

# Confirm.
$confirm = Read-Host "`nProceed? (y/N)"
if ($confirm -notmatch '^[yY]') {
    Write-Host "Cancelled" -ForegroundColor Yellow
    return
}

# Delete only the parts that still exist.
if ($inLocal) {
    Remove-LocalTag -TagName $Tag | Out-Null
}

if ($inRemote) {
    if (-not (Remove-RemoteTag -TagName $Tag -RemoteName $Remote)) {
        Write-Host "`nWARN: local delete done, but remote delete did not succeed. Re-run the script to delete remote only:" -ForegroundColor Yellow
        Write-Host "  .\tag-del.ps1 -Tag $Tag" -ForegroundColor Yellow
    }
}

Write-Host "`nDone." -ForegroundColor Green
