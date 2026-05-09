Param(
    [string]$Rid = ''
)

$ErrorActionPreference = 'Stop'

$project = Join-Path $PSScriptRoot '..\JexusManager\IIS.LanguageServer\IIS.LanguageServer.csproj'
$outputRoot = Join-Path $PSScriptRoot '..\server'
$allRids = @('win-x64', 'win-arm64', 'win-x86')
$rids = if ($Rid) { @($Rid) } else { $allRids }

if (-not $Rid -and (Test-Path $outputRoot)) {
    Remove-Item -LiteralPath $outputRoot -Recurse -Force
}

foreach ($r in $rids) {
    $outputPath = Join-Path $outputRoot $r
    if (Test-Path $outputPath) {
        Remove-Item -LiteralPath $outputPath -Recurse -Force
    }
    dotnet publish $project `
        -c Release `
        -r $r `
        --self-contained `
        -o $outputPath
}
