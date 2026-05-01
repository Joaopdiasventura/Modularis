param(
  [string]$BaseUrl = "http://localhost"
)

$ErrorActionPreference = "Stop"

$idempotencyKey = [guid]::NewGuid().ToString()
$suffix = [DateTimeOffset]::UtcNow.ToUnixTimeMilliseconds()
$email = "smoke+$suffix@example.com"
$taxId = "{0:D11}" -f ($suffix % 100000000000)
$accountPayload = @{
  email = $email
  name = "Smoke Test"
  cellphone = "5511999999999"
  taxId = $taxId
  amount = 49
  currency = "BRL"
} | ConvertTo-Json

$createBody = Invoke-RestMethod `
  -Uri "$BaseUrl/api/accounts" `
  -Method POST `
  -Headers @{ "Content-Type" = "application/json"; "Idempotency-Key" = $idempotencyKey } `
  -Body $accountPayload
$replayBody = Invoke-RestMethod `
  -Uri "$BaseUrl/api/accounts" `
  -Method POST `
  -Headers @{ "Content-Type" = "application/json"; "Idempotency-Key" = $idempotencyKey } `
  -Body $accountPayload

$paymentReference = $createBody.payment.paymentReference
$webhookPayload = @{
  eventId = [guid]::NewGuid().ToString()
  paymentReference = $paymentReference
  amount = 49
  currency = "BRL"
  status = "CONFIRMED"
  occurredAt = (Get-Date).ToUniversalTime().ToString("o")
} | ConvertTo-Json -Compress

$secret = "change-this-webhook-secret-at-least-32-characters"
$timestamp = [DateTimeOffset]::UtcNow.ToUnixTimeSeconds()
$hmac = [System.Security.Cryptography.HMACSHA256]::new([System.Text.Encoding]::UTF8.GetBytes($secret))
$signedPayload = "$timestamp.$webhookPayload"
$signature = [System.BitConverter]::ToString(
  $hmac.ComputeHash([System.Text.Encoding]::UTF8.GetBytes($signedPayload))
).Replace('-', '').ToLowerInvariant()

Invoke-RestMethod `
  -Uri "$BaseUrl/webhooks/payments" `
  -Method POST `
  -Headers @{ "Content-Type" = "application/json"; "x-payment-signature" = "t=$timestamp,v1=$signature" } `
  -Body $webhookPayload | Out-Null

Write-Output "Account created for user $($createBody.user.id)"
Write-Output "Replay body flag: $($replayBody.meta.replayed)"
Write-Output "Payment reference $paymentReference confirmed via webhook"
