param(
  [switch]$NoRestart
)

$ErrorActionPreference = "Stop"
$downScript = Join-Path $PSScriptRoot "down.ps1"
$upScript = Join-Path $PSScriptRoot "up.ps1"

& $downScript -RemoveVolumes

if (-not $NoRestart) {
  & $upScript -ForceRecreate
}
