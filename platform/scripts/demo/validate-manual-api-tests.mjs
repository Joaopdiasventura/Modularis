import assert from "node:assert/strict";
import { createHmac, randomUUID } from "node:crypto";
import { readFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const currentDir = dirname(fileURLToPath(import.meta.url));
const repoRoot = resolve(currentDir, "../..");
const docsDir = resolve(repoRoot, "docs", "demos", "manual-api");
const baseUrl = process.argv[2] || "http://localhost";
const jwtSecret = "change-this-for-production-at-least-32-characters";
const webhookSecret = "change-this-webhook-secret-at-least-32-characters";

function extractJsonScript(html, id) {
  const pattern = new RegExp(
    `<script id="${id}" type="application/json">([\\s\\S]*?)<\\/script>`,
    "i",
  );
  const match = html.match(pattern);
  assert(match, `Missing JSON script ${id}`);
  return JSON.parse(match[1]);
}

function extractIds(html) {
  return [...html.matchAll(/\sid="([^"]+)"/g)].map((match) => match[1]).sort();
}

function extractRouteIds(html) {
  return [...html.matchAll(/data-route-id="([^"]+)"/g)].map((match) => match[1]).sort();
}

function extractScenarioIds(html) {
  return [...html.matchAll(/data-scenario-id="([^"]+)"/g)].map((match) => match[1]).sort();
}

function base64UrlEncode(value) {
  return Buffer.from(value)
    .toString("base64")
    .replace(/\+/g, "-")
    .replace(/\//g, "_")
    .replace(/=+$/g, "");
}

function signJwtHs256(payload, secret) {
  const header = { alg: "HS256", typ: "JWT" };
  const encodedHeader = base64UrlEncode(JSON.stringify(header));
  const encodedPayload = base64UrlEncode(JSON.stringify(payload));
  const unsignedToken = `${encodedHeader}.${encodedPayload}`;
  const signature = createHmac("sha256", secret)
    .update(unsignedToken)
    .digest("base64")
    .replace(/\+/g, "-")
    .replace(/\//g, "_")
    .replace(/=+$/g, "");
  return `${unsignedToken}.${signature}`;
}

function buildWebhookSignature(secret, timestamp, bodyText) {
  const signatureHex = createHmac("sha256", secret)
    .update(`${timestamp}.${bodyText}`)
    .digest("hex");
  return `t=${timestamp},v1=${signatureHex}`;
}

function uniqueDigits(length) {
  const seed = `${Date.now()}${Math.floor(Math.random() * 100000)}`;
  return seed.slice(-length).padStart(length, "0");
}

function uniqueAccountPayload(prefix, overrides = {}) {
  const digits = uniqueDigits(11);
  const emailToken = `${Date.now()}-${Math.floor(Math.random() * 100000)}`;
  return {
    email: `${prefix}.${emailToken}@example.com`,
    name: `${prefix} ${emailToken}`,
    cellphone: `55${uniqueDigits(11)}`,
    taxId: digits,
    amount: 49,
    currency: "BRL",
    ...overrides,
  };
}

async function sendJsonRequest(path, options = {}) {
  const url = new URL(path, `${baseUrl}/`);
  if (options.query) {
    url.search = options.query.startsWith("?") ? options.query : `?${options.query}`;
  }

  const headers = new Headers(options.headers || {});
  if (options.accept && !headers.has("Accept")) {
    headers.set("Accept", options.accept);
  }
  if (options.body !== undefined && options.body !== null && !headers.has("Content-Type")) {
    headers.set("Content-Type", "application/json");
  }

  const response = await fetch(url, {
    method: options.method || "GET",
    headers,
    body:
      options.body === undefined || options.body === null
        ? undefined
        : typeof options.body === "string"
          ? options.body
          : JSON.stringify(options.body),
    signal: options.signal,
  });

  const text = await response.text();
  let json = null;
  try {
    json = text ? JSON.parse(text) : null;
  } catch {
    json = null;
  }

  return { response, text, json, url: url.toString() };
}

async function validateHtmlOutputs() {
  const [englishHtml, portugueseHtml] = await Promise.all([
    readFile(resolve(docsDir, "manual-api-tests.html"), "utf8"),
    readFile(resolve(docsDir, "manual-api-tests.pt-BR.html"), "utf8"),
  ]);

  assert(englishHtml.includes("<html lang=\"en\">"), "English file must declare lang=en");
  assert(
    portugueseHtml.includes("<html lang=\"pt-BR\">"),
    "Portuguese file must declare lang=pt-BR",
  );
  assert(
    englishHtml.includes("Modularis Flow Demo"),
    "English title missing",
  );
  assert(
    portugueseHtml.includes("Demo de Fluxos Modularis"),
    "Portuguese title missing",
  );
  assert(
    englishHtml.includes("id=\"result-drawer\"") &&
      englishHtml.includes("id=\"result-drawer-backdrop\""),
    "English console must include the shared result drawer",
  );
  assert(
    portugueseHtml.includes("id=\"result-drawer\"") &&
      portugueseHtml.includes("id=\"result-drawer-backdrop\""),
    "Portuguese console must include the shared result drawer",
  );

  const englishSpec = extractJsonScript(englishHtml, "manual-api-spec");
  const portugueseSpec = extractJsonScript(portugueseHtml, "manual-api-spec");
  assert.deepStrictEqual(
    portugueseSpec,
    englishSpec,
    "Embedded manual API specs must be identical",
  );

  const englishCopy = extractJsonScript(englishHtml, "manual-api-copy");
  const portugueseCopy = extractJsonScript(portugueseHtml, "manual-api-copy");
  assert.deepStrictEqual(
    Object.keys(portugueseCopy.routes),
    Object.keys(englishCopy.routes),
    "Localized route maps must expose the same route ids",
  );

  const englishIds = extractIds(englishHtml);
  const portugueseIds = extractIds(portugueseHtml);
  assert.deepStrictEqual(
    portugueseIds,
    englishIds,
    "Both HTML files must expose the same control ids",
  );

  const englishRoutes = extractRouteIds(englishHtml);
  const portugueseRoutes = extractRouteIds(portugueseHtml);
  assert.deepStrictEqual(
    portugueseRoutes,
    englishRoutes,
    "Both HTML files must expose the same route cards",
  );
  assert(
    englishRoutes.includes("accounts") &&
      englishRoutes.includes("events") &&
      englishRoutes.includes("webhook") &&
      englishRoutes.includes("custom"),
    "Expected route cards are missing from the generated HTML",
  );

  const englishScenarios = extractScenarioIds(englishHtml);
  const portugueseScenarios = extractScenarioIds(portugueseHtml);
  assert.deepStrictEqual(
    portugueseScenarios,
    englishScenarios,
    "Both HTML files must expose the same scenarios",
  );

  assert(
    englishHtml.includes("notification-status-pill") &&
      englishHtml.includes("Notification.requestPermission"),
    "English console must include browser notification controls",
  );
  assert(
    portugueseHtml.includes("notification-status-pill") &&
      portugueseHtml.includes("Notification.requestPermission"),
    "Portuguese console must include browser notification controls",
  );

  return englishSpec;
}

async function validatePublishedHtml() {
  const english = await sendJsonRequest("/api/docs");
  assert.equal(english.response.status, 200, "/api/docs must return 200");
  assert(
    english.text.includes("Modularis Flow Demo"),
    "/api/docs must serve the English console",
  );

  const portuguese = await sendJsonRequest("/api/docs/pt-br");
  assert.equal(portuguese.response.status, 200, "/api/docs/pt-br must return 200");
  assert(
    portuguese.text.includes("Demo de Fluxos Modularis"),
    "/api/docs/pt-br must serve the Portuguese console",
  );
}

async function validateCorsSupport() {
  const loopbackOrigin = "http://127.0.0.1:5500";

  const accountPreflight = await sendJsonRequest("/api/accounts", {
    method: "OPTIONS",
    headers: {
      Origin: loopbackOrigin,
      "Access-Control-Request-Method": "POST",
      "Access-Control-Request-Headers": "content-type,idempotency-key",
    },
  });
  assert.equal(accountPreflight.response.status, 204, "Account preflight must return 204");
  assert.equal(
    accountPreflight.response.headers.get("access-control-allow-origin"),
    loopbackOrigin,
    "Account preflight must allow Live Server loopback origin",
  );

  const ssePreflight = await sendJsonRequest("/api/events", {
    method: "OPTIONS",
    headers: {
      Origin: loopbackOrigin,
      "Access-Control-Request-Method": "GET",
      "Access-Control-Request-Headers": "authorization,last-event-id",
    },
  });
  assert.equal(ssePreflight.response.status, 204, "SSE preflight must return 204");
  assert.equal(
    ssePreflight.response.headers.get("access-control-allow-origin"),
    loopbackOrigin,
    "SSE preflight must allow Live Server loopback origin",
  );

  const webhookPreflight = await sendJsonRequest("/webhooks/payments", {
    method: "OPTIONS",
    headers: {
      Origin: loopbackOrigin,
      "Access-Control-Request-Method": "POST",
      "Access-Control-Request-Headers": "content-type,x-payment-signature",
    },
  });
  assert.equal(webhookPreflight.response.status, 204, "Webhook preflight must return 204");
  assert.equal(
    webhookPreflight.response.headers.get("access-control-allow-origin"),
    loopbackOrigin,
    "Webhook preflight must allow Live Server loopback origin",
  );

  const nullOriginPreflight = await sendJsonRequest("/api/accounts", {
    method: "OPTIONS",
    headers: {
      Origin: "null",
      "Access-Control-Request-Method": "POST",
      "Access-Control-Request-Headers": "content-type,idempotency-key",
    },
  });
  assert.equal(
    nullOriginPreflight.response.status,
    204,
    "file:// style preflight must return 204",
  );
  assert.equal(
    nullOriginPreflight.response.headers.get("access-control-allow-origin"),
    "null",
    "file:// style preflight must allow Origin: null",
  );

  const webhookHealth = await sendJsonRequest("/webhooks/health/live", {
    method: "GET",
    headers: { Origin: loopbackOrigin },
  });
  assert.equal(
    webhookHealth.response.headers.get("access-control-allow-origin"),
    loopbackOrigin,
    "Webhook health GET must allow Live Server loopback origin",
  );

  const paymentHealth = await sendJsonRequest("/internal/payment/health/live", {
    method: "GET",
    headers: { Origin: loopbackOrigin },
  });
  assert.equal(
    paymentHealth.response.headers.get("access-control-allow-origin"),
    loopbackOrigin,
    "Payment health GET must allow Live Server loopback origin",
  );

  const onboardingHealth = await sendJsonRequest("/internal/onboarding/health/live", {
    method: "GET",
    headers: { Origin: loopbackOrigin },
  });
  assert.equal(
    onboardingHealth.response.headers.get("access-control-allow-origin"),
    loopbackOrigin,
    "Onboarding health GET must allow Live Server loopback origin",
  );

  const identityHealth = await sendJsonRequest("/internal/identity/actuator/health/liveness", {
    method: "GET",
    headers: { Origin: loopbackOrigin },
  });
  assert.equal(
    identityHealth.response.headers.get("access-control-allow-origin"),
    loopbackOrigin,
    "Identity health GET must allow Live Server loopback origin",
  );

  const membershipHealth = await sendJsonRequest(
    "/internal/membership/actuator/health/liveness",
    {
      method: "GET",
      headers: { Origin: loopbackOrigin },
    },
  );
  assert.equal(
    membershipHealth.response.headers.get("access-control-allow-origin"),
    loopbackOrigin,
    "Membership health GET must allow Live Server loopback origin",
  );
}

async function validateHealthEndpoints(spec) {
  for (const endpoint of spec.healthEndpoints) {
    const query = endpoint.id === "gateway-live" ? "validator=1" : "";
    const result = await sendJsonRequest(endpoint.path, {
      method: endpoint.method,
      query,
      accept: "application/json",
    });
    assert.equal(
      result.response.status,
      200,
      `Expected 200 from ${endpoint.method} ${endpoint.path}`,
    );
  }
}

async function validateAccountFlow() {
  const payload = uniqueAccountPayload("validator-create");
  const idempotencyKey = randomUUID();

  const created = await sendJsonRequest("/api/accounts", {
    method: "POST",
    headers: { "Idempotency-Key": idempotencyKey },
    body: payload,
  });
  assert.equal(created.response.status, 201, "Account create must return 201");
  assert.equal(
    created.response.headers.get("idempotency-replayed"),
    "false",
    "First account creation must not be marked as replayed",
  );
  assert(created.response.headers.get("set-cookie"), "Create account must set auth cookie");
  assert(created.json?.user?.id, "Create account must return a user id");
  assert(created.json?.payment?.paymentReference, "Create account must return a payment reference");

  const replay = await sendJsonRequest("/api/accounts", {
    method: "POST",
    headers: { "Idempotency-Key": idempotencyKey },
    body: payload,
  });
  assert.equal(replay.response.status, 201, "Replay must still return 201");
  assert.equal(
    replay.response.headers.get("idempotency-replayed"),
    "true",
    "Replay must be marked as replayed",
  );
  assert.equal(replay.json?.user?.id, created.json.user.id, "Replay must preserve user id");
  assert.equal(
    replay.json?.payment?.paymentReference,
    created.json.payment.paymentReference,
    "Replay must preserve payment reference",
  );

  return created.json;
}

async function validateConflictReplay() {
  const idempotencyKey = randomUUID();
  const original = uniqueAccountPayload("validator-conflict", { amount: 65 });
  const conflicting = { ...original, amount: 66, name: `${original.name} replay` };

  const prime = await sendJsonRequest("/api/accounts", {
    method: "POST",
    headers: { "Idempotency-Key": idempotencyKey },
    body: original,
  });
  assert.equal(prime.response.status, 201, "Conflict prime must return 201");

  const replay = await sendJsonRequest("/api/accounts", {
    method: "POST",
    headers: { "Idempotency-Key": idempotencyKey },
    body: conflicting,
  });
  assert.equal(replay.response.status, 409, "Conflicting replay must return 409");
  assert.match(
    replay.text,
    /Idempotency-Key was already used with a different payload/,
    "Conflict replay must explain idempotency key reuse",
  );
}

async function validateAccountErrors() {
  const missingKey = await sendJsonRequest("/api/accounts", {
    method: "POST",
    body: uniqueAccountPayload("validator-missing"),
  });
  assert.equal(missingKey.response.status, 400, "Missing Idempotency-Key must return 400");
  assert.match(
    missingKey.text,
    /Idempotency-Key header is required/,
    "Missing Idempotency-Key error message must be returned",
  );

  const invalidPayload = await sendJsonRequest("/api/accounts", {
    method: "POST",
    headers: { "Idempotency-Key": randomUUID() },
    body: {
      email: "not-an-email",
      name: "",
      cellphone: "5511666666666",
      taxId: uniqueDigits(11),
      amount: 0,
      currency: "br",
    },
  });
  assert.equal(invalidPayload.response.status, 400, "Invalid DTO payload must return 400");

  const unsupportedCurrency = await sendJsonRequest("/api/accounts", {
    method: "POST",
    headers: { "Idempotency-Key": randomUUID() },
    body: uniqueAccountPayload("validator-currency", { currency: "BTC" }),
  });
  assert.equal(
    unsupportedCurrency.response.status,
    400,
    "Unsupported currency must return 400",
  );
  assert.match(
    unsupportedCurrency.text,
    /Unsupported currency/,
    "Unsupported currency error message must be returned",
  );
}

async function collectSseEvents(userId, paymentReference, amount, currency) {
  const token = signJwtHs256(
    {
      sub: userId,
      exp: Math.floor(Date.now() / 1000) + 3600,
    },
    jwtSecret,
  );

  const url = new URL("/api/events", `${baseUrl}/`);
  const controller = new AbortController();
  const headers = new Headers({
    Accept: "text/event-stream",
    Authorization: `Bearer ${token}`,
  });

  const response = await fetch(url, {
    method: "GET",
    headers,
    signal: controller.signal,
  });
  assert.equal(response.status, 200, "Authorized SSE probe must return 200");
  assert.match(
    response.headers.get("content-type") || "",
    /text\/event-stream/i,
    "Authorized SSE response must be an event stream",
  );
  assert(response.body, "Authorized SSE response must expose a stream body");

  const reader = response.body.getReader();
  const decoder = new TextDecoder();
  const events = [];
  let buffer = "";

  const sendWebhookAfterConnect = (async () => {
    const body = JSON.stringify(
      {
        eventId: randomUUID(),
        paymentReference,
        amount,
        currency,
        status: "CONFIRMED",
        occurredAt: new Date().toISOString(),
      },
      null,
      2,
    );
    const timestamp = Math.floor(Date.now() / 1000);
    const signature = buildWebhookSignature(webhookSecret, timestamp, body);
    await sendJsonRequest("/webhooks/payments", {
      method: "POST",
      headers: { "x-payment-signature": signature },
      body,
    });
  })();

  const timeout = setTimeout(() => controller.abort(), 6000);

  try {
    while (events.length < 1) {
      const { value, done } = await reader.read();
      if (done) break;
      buffer += decoder.decode(value, { stream: true }).replace(/\r\n/g, "\n");
      let boundaryIndex = buffer.indexOf("\n\n");
      while (boundaryIndex !== -1) {
        const chunk = buffer.slice(0, boundaryIndex).trim();
        buffer = buffer.slice(boundaryIndex + 2);
        boundaryIndex = buffer.indexOf("\n\n");
        if (!chunk) continue;

        const event = { type: "message", data: "" };
        for (const line of chunk.split("\n")) {
          if (!line || line.startsWith(":")) continue;
          if (line.startsWith("event:")) {
            event.type = line.slice(6).trim();
          }
          if (line.startsWith("data:")) {
            event.data += `${event.data ? "\n" : ""}${line.slice(5).trimStart()}`;
          }
        }
        events.push(event);
      }
    }
  } catch (error) {
    if (error?.name !== "AbortError") {
      throw error;
    }
  } finally {
    clearTimeout(timeout);
    controller.abort();
    await sendWebhookAfterConnect;
  }

  assert(events.length >= 1, "Authorized SSE stream must emit at least one event");
  assert(
    events.some((event) =>
      /payment\.status-updated|user\.premium-updated/.test(event.type || ""),
    ),
    "Authorized SSE stream must emit a payment or premium update event",
  );
}

async function validateSseFlow() {
  const unauthorized = await sendJsonRequest("/api/events", {
    method: "GET",
    headers: { Accept: "text/event-stream" },
  });
  assert.equal(unauthorized.response.status, 401, "Unauthorized SSE probe must return 401");

  const created = await sendJsonRequest("/api/accounts", {
    method: "POST",
    headers: { "Idempotency-Key": randomUUID() },
    body: uniqueAccountPayload("validator-sse"),
  });
  assert.equal(created.response.status, 201, "SSE setup account must return 201");

  await collectSseEvents(
    created.json.user.id,
    created.json.payment.paymentReference,
    created.json.payment.amount,
    created.json.payment.currency,
  );
}

async function validateWebhookVariants(paymentReference) {
  const confirmedBody = JSON.stringify(
    {
      eventId: randomUUID(),
      paymentReference,
      amount: 49,
      currency: "BRL",
      status: "CONFIRMED",
      occurredAt: new Date().toISOString(),
    },
    null,
    2,
  );
  const confirmedTimestamp = Math.floor(Date.now() / 1000);
  const confirmedSignature = buildWebhookSignature(
    webhookSecret,
    confirmedTimestamp,
    confirmedBody,
  );

  const confirmed = await sendJsonRequest("/webhooks/payments", {
    method: "POST",
    headers: { "x-payment-signature": confirmedSignature },
    body: confirmedBody,
  });
  assert.equal(confirmed.response.status, 202, "Confirmed webhook must return 202");
  assert.equal(confirmed.json?.status, "accepted", "Confirmed webhook must be accepted");

  const unsupportedBody = JSON.stringify(
    {
      eventId: randomUUID(),
      paymentReference,
      amount: 49,
      currency: "BRL",
      status: "PENDING",
      occurredAt: new Date().toISOString(),
    },
    null,
    2,
  );
  const unsupportedTimestamp = Math.floor(Date.now() / 1000);
  const unsupportedSignature = buildWebhookSignature(
    webhookSecret,
    unsupportedTimestamp,
    unsupportedBody,
  );
  const unsupported = await sendJsonRequest("/webhooks/payments", {
    method: "POST",
    headers: { "x-payment-signature": unsupportedSignature },
    body: unsupportedBody,
  });
  assert.equal(unsupported.response.status, 202, "Unsupported status must return 202");
  assert.equal(unsupported.json?.status, "ignored", "Unsupported status must be ignored");

  const invalid = await sendJsonRequest("/webhooks/payments", {
    method: "POST",
    headers: {
      "x-payment-signature": confirmedSignature.replace(/.$/, (value) =>
        value === "0" ? "1" : "0",
      ),
    },
    body: confirmedBody,
  });
  assert.equal(invalid.response.status, 401, "Invalid signature must return 401");

  const expiredTimestamp = Math.floor(Date.now() / 1000) - 900;
  const expiredBody = JSON.stringify(
    {
      eventId: randomUUID(),
      paymentReference,
      amount: 49,
      currency: "BRL",
      status: "CONFIRMED",
      occurredAt: new Date().toISOString(),
    },
    null,
    2,
  );
  const expiredSignature = buildWebhookSignature(
    webhookSecret,
    expiredTimestamp,
    expiredBody,
  );
  const expired = await sendJsonRequest("/webhooks/payments", {
    method: "POST",
    headers: { "x-payment-signature": expiredSignature },
    body: expiredBody,
  });
  assert.equal(expired.response.status, 400, "Expired signature must return 400");
}

async function main() {
  const spec = await validateHtmlOutputs();
  await validatePublishedHtml();
  await validateCorsSupport();
  await validateHealthEndpoints(spec);
  const createdAccount = await validateAccountFlow();
  await validateConflictReplay();
  await validateAccountErrors();
  await validateSseFlow();
  await validateWebhookVariants(createdAccount.payment.paymentReference);

  const summary = {
    htmlOutputsValidated: true,
    publishedRoutes: ["/api/docs", "/api/docs/pt-br"],
    healthEndpointsValidated: spec.healthEndpoints.length,
    scenariosValidated: spec.scenarios.map((scenario) => scenario.id),
    notificationControlsValidated: true,
    sampleUserId: createdAccount.user.id,
    samplePaymentReference: createdAccount.payment.paymentReference,
  };

  process.stdout.write(`${JSON.stringify(summary, null, 2)}\n`);
}

await main();
