#Requires -Version 5.1
<#
.SYNOPSIS
  Create a symbolic link from an Obsidian vault's plugin folder to this repo's `dist/` directory.

.DESCRIPTION
  Run `npm run build` (or `npm run dev`) first so `dist/` contains `main.js`, `manifest.json`, and
  `styles.css`. This script links `<VaultPath>/.obsidian/plugins/<PluginId>` → `<repo>/dist`.

  Requires either:
    - An elevated (Administrator) PowerShell session, OR
    - Windows 10+ Developer Mode enabled (Settings → Privacy & security → For developers).

.PARAMETER VaultPath
  Absolute path to the Obsidian vault root (the folder that contains `.obsidian`).

.PARAMETER PluginId
  Plugin folder name to create under `.obsidian/plugins`. Defaults to the `id` in manifest.json.

.PARAMETER Force
  Replace any existing file/directory/symlink at the target path.

.EXAMPLE
  ./scripts/link-to-vault.ps1 -VaultPath 'D:\MyVault'

.EXAMPLE
  ./scripts/link-to-vault.ps1 -VaultPath 'D:\MyVault' -Force
#>

[CmdletBinding()]
param(
  [Parameter(Mandatory = $true)]
  [string]$VaultPath,

  [string]$PluginId,

  [switch]$Force
)

$ErrorActionPreference = 'Stop'

$repoRoot = Resolve-Path (Join-Path $PSScriptRoot '..')
$distPath = Join-Path $repoRoot 'dist'
$manifestPath = Join-Path $repoRoot 'manifest.json'

if (-not (Test-Path $manifestPath)) {
  throw "manifest.json not found at $manifestPath"
}

if (-not $PluginId) {
  $manifest = Get-Content $manifestPath -Raw | ConvertFrom-Json
  $PluginId = $manifest.id
  if (-not $PluginId) { throw "Could not read `id` from manifest.json" }
}

if (-not (Test-Path $distPath)) {
  throw "dist/ not found. Run `npm run build` first (creates dist/main.js, manifest.json, styles.css)."
}

foreach ($required in 'main.js', 'manifest.json', 'styles.css') {
  $p = Join-Path $distPath $required
  if (-not (Test-Path $p)) {
    throw "Missing $required in dist/. Run `npm run build`."
  }
}

$vaultFull = Resolve-Path $VaultPath
$pluginsDir = Join-Path $vaultFull '.obsidian\plugins'
if (-not (Test-Path $pluginsDir)) {
  New-Item -ItemType Directory -Path $pluginsDir -Force | Out-Null
}

$linkPath = Join-Path $pluginsDir $PluginId

if (Test-Path $linkPath) {
  if (-not $Force) {
    throw "Target already exists: $linkPath. Re-run with -Force to replace."
  }
  Write-Host "Removing existing target: $linkPath" -ForegroundColor Yellow
  Remove-Item $linkPath -Recurse -Force
}

Write-Host "Linking:" -ForegroundColor Cyan
Write-Host "  $linkPath" -ForegroundColor Cyan
Write-Host "  -> $distPath" -ForegroundColor Cyan

try {
  New-Item -ItemType SymbolicLink -Path $linkPath -Target $distPath | Out-Null
}
catch {
  throw @"
Failed to create symbolic link. This usually means the session is not elevated
and Developer Mode is not enabled.

Fix one of:
  1. Re-run this script from an Administrator PowerShell, OR
  2. Enable: Settings -> Privacy & security -> For developers -> Developer Mode

Original error: $($_.Exception.Message)
"@
}

Write-Host "OK. Enable '$PluginId' in Obsidian -> Settings -> Community plugins." -ForegroundColor Green
