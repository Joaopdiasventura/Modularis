param(
  [string]$BaseUrl = "http://localhost"
)

$ErrorActionPreference = "Stop"

$routes = @(
  "/api/health/live",
  "/api/health/ready",
  "/webhooks/health/live",
  "/webhooks/health/ready",
  "/internal/onboarding/health/live",
  "/internal/onboarding/health/ready",
  "/internal/identity/actuator/health/liveness",
  "/internal/identity/actuator/health/readiness",
  "/internal/membership/actuator/health/liveness",
  "/internal/membership/actuator/health/readiness",
  "/internal/payment/health/live",
  "/internal/payment/health/ready"
)

$failed = $false

foreach ($route in $routes) {
  try {
    $response = Invoke-WebRequest -Uri "$BaseUrl$route" -UseBasicParsing
    Write-Output ("{0}`t{1}" -f $response.StatusCode, $route)
    if ($response.StatusCode -ne 200) {
      $failed = $true
    }
  } catch {
    Write-Output ("ERROR`t{0}`t{1}" -f $route, $_.Exception.Message)
    $failed = $true
  }
}

if ($failed) {
  exit 1
}
