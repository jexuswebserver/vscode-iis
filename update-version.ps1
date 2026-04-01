Param(
    [string]$Tag = ''
)

Set-StrictMode -Version Latest
$here = Split-Path -Path $MyInvocation.MyCommand.Definition -Parent
Set-Location $here

function Fail([string]$msg) {
    Write-Error $msg
    exit 1
}

if (-not (Get-Command git -ErrorAction SilentlyContinue)) {
    Fail 'git is not available on PATH.'
}

# Try GitVersion first (if installed). Fallback to latest git tag when not present or fails.
$ver = $null
if (Get-Command gitversion -ErrorAction SilentlyContinue) {
    try {
        Write-Host 'Using GitVersion to compute semantic version...'
        $gvJson = gitversion /output json 2>$null | Out-String
        if ($gvJson) {
            $gv = $gvJson | ConvertFrom-Json
            if ($gv.SemVer) { $ver = $gv.SemVer }
            elseif ($gv.FullSemVer) { $ver = $gv.FullSemVer }
        }
    }
    catch {
        Write-Warning 'GitVersion invocation failed, falling back to git tag.'
    }
}

if (-not $ver) {
    if ([string]::IsNullOrWhiteSpace($Tag)) {
        try {
            $Tag = (git describe --tags --abbrev=0).Trim()
        }
        catch {
            Fail 'Failed to determine latest git tag. Create a tag like v1.0.0 and retry, or install GitVersion.'
        }
    }

    if ($Tag.StartsWith('v')) { $ver = $Tag.Substring(1) } else { $ver = $Tag }
}

if (-not ($ver -match '^[0-9]+\.[0-9]+\.[0-9]+(?:[-+].*)?$')) {
    Fail "Computed version '$ver' does not look like a semver (MAJOR.MINOR.PATCH)."
}

Write-Host "Setting package.json version => $ver"

$pkgPath = Join-Path $here 'package.json'
if (-not (Test-Path $pkgPath)) { Fail 'package.json not found.' }

$json = Get-Content $pkgPath -Raw | ConvertFrom-Json
$old = $json.version
if ($old -eq $ver) {
    Write-Host "package.json already at version $ver"
    exit 0
}

$json.version = $ver

$tmp = $json | ConvertTo-Json -Depth 10
Set-Content -Path $pkgPath -Value $tmp -Encoding UTF8

Write-Host "Updated package.json version: $old -> $ver"
