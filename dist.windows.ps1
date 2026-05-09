Param(
    [switch]$Publish
)

Set-StrictMode -Version Latest
$ErrorActionPreference = 'Stop'

$here = Split-Path -Path $MyInvocation.MyCommand.Definition -Parent
Set-Location $here

$targetRidMap = [ordered]@{
    'win32-x64'   = 'win-x64'
    'win32-arm64' = 'win-arm64'
}

Write-Host 'Syncing package.json version from GitVersion/latest git tag (if present)...'
.\update-version.ps1

Write-Host 'Installing dependencies...'
npm ci

Write-Host 'Building extension JS bundle...'
npm run package

$pkg = Get-Content package.json -Raw | ConvertFrom-Json
$createdVsix = @()

foreach ($target in $targetRidMap.Keys) {
    $rid = $targetRidMap[$target]
    Write-Host "Building language server for $rid..."
    powershell -NoProfile -ExecutionPolicy Bypass -File ./scripts/publish-language-server.ps1 -Rid $rid
    if ($LASTEXITCODE -ne 0) {
        throw "Language server build failed for $rid."
    }

    $vsixName = "$($pkg.name)-$($pkg.version)-$target.vsix"
    Write-Host "Packaging .vsix for $target as $vsixName..."
    npx -y @vscode/vsce package --allow-star-activation --target $target --out $vsixName --no-dependencies
    if ($LASTEXITCODE -ne 0) {
        throw "Packaging failed for target $target."
    }
    $createdVsix += $vsixName
}

if ($Publish) {
    if ([string]::IsNullOrWhiteSpace($env:VSCE_PAT)) {
        throw 'VSCE_PAT is not set. Set VSCE_PAT and run the script again, or use publish.ps1.'
    }

    foreach ($vsix in $createdVsix) {
        Write-Host "Publishing $vsix to VS Code Marketplace..."
        npx -y @vscode/vsce publish --packagePath $vsix
        if ($LASTEXITCODE -ne 0) {
            throw "Publishing failed for $vsix."
        }
    }
}

Write-Host ''
Write-Host 'Packaging complete:'
foreach ($vsix in $createdVsix) {
    Write-Host "  $vsix"
}
