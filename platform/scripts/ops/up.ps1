param(
  [switch]$ForceRecreate,
  [switch]$NoBuild
)

$ErrorActionPreference = "Stop"
$composeFile = (Resolve-Path (Join-Path $PSScriptRoot "..\\..\\..\\compose.yaml")).Path
$arguments = @("compose", "-f", $composeFile, "up", "-d")

if (-not $NoBuild) {
  $arguments += "--build"
}

if ($ForceRecreate) {
  $arguments += "--force-recreate"
}

docker @arguments
