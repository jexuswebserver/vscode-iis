$ErrorActionPreference = 'Stop'

$project = Join-Path $PSScriptRoot '..\JexusManager\IIS.LanguageServer\IIS.LanguageServer.csproj'
$outputRoot = Join-Path $PSScriptRoot '..\server'
$rids = @('win-x64', 'win-arm64', 'win-x86')

if (Test-Path $outputRoot) {
    Remove-Item -LiteralPath $outputRoot -Recurse -Force
}

foreach ($rid in $rids) {
    $outputPath = Join-Path $outputRoot $rid
    dotnet publish $project `
        -c Release `
        -r $rid `
        --self-contained `
        -o $outputPath
}
