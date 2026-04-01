Param(
    [string]$Token
)

Set-StrictMode -Version Latest
$ErrorActionPreference = 'Stop'

$here = Split-Path -Path $MyInvocation.MyCommand.Definition -Parent
Set-Location $here

$tokenStoreDir = Join-Path $env:LOCALAPPDATA 'vscode-iis'
$tokenStorePath = Join-Path $tokenStoreDir 'vsce-pat.bin'

function Save-Token {
    param(
        [string]$PlainTextToken
    )

    if ([string]::IsNullOrWhiteSpace($PlainTextToken)) {
        throw 'Cannot save an empty Marketplace token.'
    }

    if (-not (Test-Path $tokenStoreDir)) {
        New-Item -ItemType Directory -Path $tokenStoreDir -Force | Out-Null
    }

    $secureToken = ConvertTo-SecureString $PlainTextToken -AsPlainText -Force
    $encrypted = ConvertFrom-SecureString $secureToken
    Set-Content -Path $tokenStorePath -Value $encrypted -Encoding UTF8
}

function Load-Token {
    if (-not (Test-Path $tokenStorePath)) {
        return $null
    }

    try {
        $encrypted = Get-Content -Path $tokenStorePath -Raw -Encoding UTF8
        if ([string]::IsNullOrWhiteSpace($encrypted)) {
            return $null
        }

        $secureToken = ConvertTo-SecureString $encrypted
        $credential = New-Object System.Management.Automation.PSCredential ('vsce', $secureToken)
        return $credential.GetNetworkCredential().Password
    }
    catch {
        Write-Warning "Stored Marketplace token could not be read from $tokenStorePath."
        return $null
    }
}

function Read-TokenFromPrompt {
    if (-not [Environment]::UserInteractive) {
        return $null
    }

    Write-Host 'Enter VS Code Marketplace token (PAT):'
    $secureInput = Read-Host -AsSecureString
    if (-not $secureInput) {
        return $null
    }

    $credential = New-Object System.Management.Automation.PSCredential ('vsce', $secureInput)
    $plain = $credential.GetNetworkCredential().Password
    if ([string]::IsNullOrWhiteSpace($plain)) {
        return $null
    }

    return $plain
}

if (-not [string]::IsNullOrWhiteSpace($Token)) {
    Save-Token $Token
    Write-Host "Saved Marketplace token for the current Windows user at $tokenStorePath"
}
else {
    $Token = Load-Token
}

if ([string]::IsNullOrWhiteSpace($Token)) {
    $Token = Read-TokenFromPrompt
    if (-not [string]::IsNullOrWhiteSpace($Token)) {
        Save-Token $Token
        Write-Host "Saved Marketplace token for the current Windows user at $tokenStorePath"
    }
}

if ([string]::IsNullOrWhiteSpace($Token)) {
    Write-Warning 'No Marketplace token was provided, and no stored token could be loaded or entered. Publishing was skipped.'
    exit 1
}

$env:VSCE_PAT = $Token

Write-Host 'Creating Windows-targeted VSIX packages...'
& .\dist.windows.ps1
if ($LASTEXITCODE -ne 0) {
    exit $LASTEXITCODE
}

$pkg = Get-Content package.json -Raw | ConvertFrom-Json
$targets = @('win32-x64', 'win32-arm64')
$publishFailures = @()

foreach ($target in $targets) {
    $vsixName = "$($pkg.name)-$($pkg.version)-$target.vsix"
    if (-not (Test-Path $vsixName)) {
        $publishFailures += "$vsixName (missing)"
        continue
    }

    Write-Host "Publishing $vsixName to VS Code Marketplace..."
    npx -y @vscode/vsce publish --packagePath $vsixName
    if ($LASTEXITCODE -ne 0) {
        $publishFailures += $vsixName
    }
}

if ($publishFailures.Count -gt 0) {
    Write-Warning ("Marketplace publish did not fully succeed. Failed packages: " + ($publishFailures -join ', '))
    exit 1
}

Write-Host 'Marketplace publish completed successfully.'
