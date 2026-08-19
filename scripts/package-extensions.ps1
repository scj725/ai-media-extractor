[CmdletBinding()]
param(
    [string]$OutputDirectory = (Join-Path $PSScriptRoot '..\dist')
)

$ErrorActionPreference = 'Stop'
$repoRoot = (Resolve-Path (Join-Path $PSScriptRoot '..')).Path
$targets = @(
    @{ Name = 'chrome'; Directory = 'extension\edge' },
    @{ Name = 'edge'; Directory = 'extension\edge' },
    @{ Name = 'firefox'; Directory = 'extension\firefox' }
)

if (-not (Test-Path -LiteralPath $OutputDirectory)) {
    New-Item -ItemType Directory -Path $OutputDirectory | Out-Null
}

foreach ($target in $targets) {
    $source = Join-Path $repoRoot $target.Directory
    $manifestPath = Join-Path $source 'manifest.json'
    if (-not (Test-Path -LiteralPath $manifestPath)) {
        throw "Missing manifest: $manifestPath"
    }

    $manifest = Get-Content -Raw -LiteralPath $manifestPath | ConvertFrom-Json
    if ([string]::IsNullOrWhiteSpace([string]$manifest.version)) {
        throw "Manifest version is missing: $manifestPath"
    }

    $archiveName = "ai-media-extractor-$($target.Name)-v$($manifest.version).zip"
    $archivePath = Join-Path (Resolve-Path $OutputDirectory).Path $archiveName
    if (Test-Path -LiteralPath $archivePath) {
        Remove-Item -LiteralPath $archivePath -Force
    }

    Compress-Archive -Path (Join-Path $source '*') -DestinationPath $archivePath -CompressionLevel Optimal
    Write-Host "Created $archivePath"
}

Write-Host "Packaging complete. Upload the ZIP files from $((Resolve-Path $OutputDirectory).Path)."
