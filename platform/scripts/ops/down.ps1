param(
  [switch]$RemoveVolumes,
  [switch]$RemoveOrphans = $true
)

$ErrorActionPreference = "Stop"
$composeFile = (Resolve-Path (Join-Path $PSScriptRoot "..\\..\\..\\compose.yaml")).Path
$arguments = @("compose", "-f", $composeFile, "down")

if ($RemoveOrphans) {
  $arguments += "--remove-orphans"
}

if ($RemoveVolumes) {
  $arguments += "-v"
}

docker @arguments
