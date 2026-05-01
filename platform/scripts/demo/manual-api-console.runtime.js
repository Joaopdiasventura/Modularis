const HEALTH_SERVICE_MAP = {
  gateway: { live: "gateway-live", ready: "gateway-ready" },
  webhook: { live: "webhook-live", ready: "webhook-ready" },
  payment: { live: "payment-live", ready: "payment-ready" },
  onboarding: { live: "onboarding-live", ready: "onboarding-ready" },
  identity: { live: "identity-live", ready: "identity-ready" },
  membership: { live: "membership-live", ready: "membership-ready" },
};

const PERSISTED_CONTROL_IDS = new Set([
  "base-url",
  "global-headers",
  "include-credentials",
  "bearer-token",
  "jwt-user-id",
  "jwt-secret",
  "webhook--headerName",
  "webhook--secret",
]);

const state = {
  lastAccount: null,
  lastEvent: null,
  eventCount: 0,
  activeEventStream: null,
  activeResultId: null,
  resultCache: new Map(),
  lastNotification: null,
  notificationStatus: "default",
  notificationMessage: "",
  notificationDedupe: new Map(),
  healthPulse: new Map(),
  activityFeed: [],
  eventTypes: new Set(),
  streamStatus: "idle",
  lastWebhookAcceptedAt: null,
  lastSweepAt: null,
};

const uiLabels = buildUiLabels(uiCopy.localeCode);

document.addEventListener("DOMContentLoaded", async () => {
  restorePersistedControls();
  initializeBaseUrl();
  initializeDefaults();
  wireActions();
  initializeResultDrawer();
  wireDomainNavigation();
  renderSharedState();
  renderNotificationState();
  renderStackPulse();
  renderActivityFeed();
  renderFlowProgress();
  renderContextStrip();
  await initializeNotifications();
  await refreshWebhookSignature("webhook");
  void runHealthSweep({ silent: true });
  window.requestAnimationFrame(() => {
    document.body.dataset.uiReady = "true";
  });
});

function routeFieldId(routeId, field) {
  return `${routeId}--${field}`;
}

function getField(routeId, field) {
  return document.getElementById(routeFieldId(routeId, field));
}

function buildUiLabels(localeCode) {
  if (localeCode === "pt-BR") {
    return {
      runtime: {
        noStreamActivityYet: "Nenhuma atividade no stream ainda.",
        openingSse: "Abrindo stream...",
        sseConnected: "Stream conectado.",
        sseClosedByServer: "O servidor encerrou o stream.",
        sseDisconnected: "Stream desconectado.",
        sseErrorPrefix: "Erro no stream:",
        noPaymentReferenceAvailable: "Nenhuma referência de pagamento disponível.",
        createAccountFirst: "Crie uma conta primeiro.",
        failedToGenerateWebhookSignature: "Não foi possível gerar a assinatura.",
        invalidJsonInput: "JSON inválido.",
        cannotGenerateJwt: "Não foi possível gerar o JWT.",
        provideUserIdFirst: "Informe primeiro um ID de usuário.",
        jwtGenerationFailed: "Falha ao gerar o JWT.",
        sseRequestFailed: "Falha ao abrir o stream SSE.",
        clientError: "Erro do cliente",
        empty: "(vazio)",
        requestFailedSuffix: "falhou",
        notApplicable: "n/a",
        messageTypeFallback: "message",
        stateNotSet: "não definido",
        jsonObjectRequired: "O JSON precisa ser um objeto.",
        clipboardUnavailable: "A área de transferência não está disponível neste contexto.",
        missingIdempotencyKey: "Informe ou gere uma Idempotency-Key primeiro.",
      },
      notification: {
        states: {
          unsupported: "Indisponível",
          blocked: "Bloqueado",
          default: "Pendente",
          granted: "Ativado",
          error: "Erro",
        },
        messages: {
          unsupported: "Este contexto não oferece suporte a notificações nativas.",
          blocked: "As notificações estão bloqueadas. O aviso continua visível na página.",
          default: "Ative as notificações se quiser alertas nativos.",
          granted: "Alertas nativos ativados.",
          error: "Não foi possível ativar as notificações.",
          empty: "Nenhum alerta ainda.",
          title: "Pagamento confirmado",
          referenceLabel: "Referência",
          amountLabel: "Valor",
          statusLabel: "Status",
          sourceLabel: "Origem",
          sourceWebhook: "webhook confirmado",
          sourceSse: "evento SSE",
        },
      },
      health: {
        title: "Health",
        idle: "Não verificado",
        checking: "Verificando",
        up: "Saudável",
        degraded: "Parcial",
        down: "Indisponível",
        running: "Verificando serviços...",
        done: "Serviços verificados.",
        partial: "Verificação concluída com degradação.",
      },
      statusStrip: {
        credentialsOn: "Cookies ativos",
        credentialsOff: "Cookies off",
        authAnonymous: "Anônimo",
        authBearer: "Bearer",
        authHybrid: "Bearer + cookies",
        notificationsDefault: "Pendente",
        notificationsGranted: "Ativo",
        notificationsBlocked: "Bloqueado",
        notificationsUnsupported: "Indisponível",
        notificationsError: "Erro",
        streamIdle: "Parado",
        streamOpening: "Conectando",
        streamConnected: "Ao vivo",
        streamClosed: "Fechado",
        streamError: "Erro",
      },
      stream: {
        idle: "Parado",
      },
      results: {
        title: "Resultado",
        open: "Ver detalhes",
        noLiveLog: "Sem eventos no stream ainda.",
      },
      common: {
        copied: "Copiado",
        clipboard: "Clipboard",
      },
    };
  }

  return {
    runtime: {
      noStreamActivityYet: "No stream activity yet.",
      openingSse: "Opening stream...",
      sseConnected: "Stream connected.",
      sseClosedByServer: "Stream closed by server.",
      sseDisconnected: "Stream disconnected.",
      sseErrorPrefix: "Stream error:",
      noPaymentReferenceAvailable: "No payment reference available.",
      createAccountFirst: "Create an account first.",
      failedToGenerateWebhookSignature: "Failed to generate signature.",
      invalidJsonInput: "Invalid JSON.",
      cannotGenerateJwt: "Could not generate JWT.",
      provideUserIdFirst: "Provide a user id first.",
      jwtGenerationFailed: "JWT generation failed.",
      sseRequestFailed: "SSE request failed.",
      clientError: "Client error",
      empty: "(empty)",
      requestFailedSuffix: "failed",
      notApplicable: "n/a",
      messageTypeFallback: "message",
      stateNotSet: "not set",
      jsonObjectRequired: "JSON must be an object.",
      clipboardUnavailable: "Clipboard unavailable in this browser context.",
      missingIdempotencyKey: "Provide or generate an Idempotency-Key first.",
    },
    notification: {
      states: {
        unsupported: "Unsupported",
        blocked: "Blocked",
        default: "Pending",
        granted: "Enabled",
        error: "Error",
      },
      messages: {
        unsupported: "Native notifications are not supported here.",
        blocked: "Blocked. The page still shows the alert.",
        default: "Enable notifications if you want native alerts.",
        granted: "Native alerts enabled.",
        error: "Could not enable notifications.",
        empty: "No alerts yet.",
        title: "Payment confirmed",
        referenceLabel: "Reference",
        amountLabel: "Amount",
        statusLabel: "Status",
        sourceLabel: "Source",
        sourceWebhook: "confirmed webhook",
        sourceSse: "SSE event",
      },
    },
    health: {
      title: "Health",
      idle: "Not checked",
      checking: "Checking",
      up: "Healthy",
      degraded: "Partial",
      down: "Unavailable",
      running: "Checking services...",
      done: "Services checked.",
      partial: "Sweep finished with degraded services.",
    },
    statusStrip: {
      credentialsOn: "Cookies on",
      credentialsOff: "Cookies off",
      authAnonymous: "Anonymous",
      authBearer: "Bearer",
      authHybrid: "Bearer + cookies",
      notificationsDefault: "Pending",
      notificationsGranted: "Enabled",
      notificationsBlocked: "Blocked",
      notificationsUnsupported: "Unsupported",
      notificationsError: "Error",
      streamIdle: "Idle",
      streamOpening: "Connecting",
      streamConnected: "Live",
      streamClosed: "Closed",
      streamError: "Error",
    },
    stream: {
      idle: "Idle",
    },
    results: {
      title: "Result",
      open: "View details",
      noLiveLog: "No stream events yet.",
    },
    common: {
      copied: "Copied",
      clipboard: "Clipboard",
    },
  };
}

function initializeResultDrawer() {
  const drawer = document.getElementById("result-drawer");
  const backdrop = document.getElementById("result-drawer-backdrop");
  const closeButton = document.getElementById("result-drawer-close");
  if (!drawer || !backdrop || !closeButton) {
    return;
  }

  backdrop.addEventListener("click", closeResultDrawer);
  closeButton.addEventListener("click", closeResultDrawer);

  document.addEventListener("keydown", (event) => {
    if (event.key === "Escape" && !drawer.hidden) {
      closeResultDrawer();
    }
  });
}

function resultStatusClass(status) {
  if (status >= 200 && status < 300) return "ok";
  if (status >= 400 || status === 0) return "bad";
  return "warn";
}

function getResultContainer(resultId) {
  return document.getElementById(resultId);
}

function getResultEmptyLabel(resultId) {
  const container = getResultContainer(resultId);
  return container?.dataset.resultEmptyLabel || uiLabels.runtime.empty;
}

function getResultTitle(resultId) {
  const container = getResultContainer(resultId);
  return container?.dataset.resultTitle || uiLabels.results.title;
}

function renderEmptyResult(resultId) {
  const container = getResultContainer(resultId);
  if (!container) {
    return;
  }

  const emptyLabel = getResultEmptyLabel(resultId);
  container.innerHTML = `<span class="route-status__empty">${escapeHtml(emptyLabel)}</span>`;
}

function resultSummaryHint(result) {
  try {
    const parsed = new URL(result.url);
    return `${result.method} ${parsed.pathname}${parsed.search}`;
  } catch {
    return `${result.method} ${result.url}`;
  }
}

function buildCopyPayload(result) {
  return JSON.stringify(
    {
      url: result.url,
      method: result.method,
      durationMs: result.durationMs,
      status: result.status,
      statusText: result.statusText,
      requestHeaders: result.requestHeaders,
      requestBody: tryParseJson(result.requestBody) || result.requestBody,
      responseHeaders: result.responseHeaders,
      responseBody: tryParseJson(result.rawBody) || result.rawBody,
      liveLog: result.liveLog || "",
    },
    null,
    2,
  );
}

function renderResultSummary(resultId, result) {
  const container = getResultContainer(resultId);
  if (!container) {
    return;
  }

  const statusClass = resultStatusClass(result.status);
  container.innerHTML = `
    <div class="result-summary">
      <div class="result-summary__meta">
        <span class="status-pill ${statusClass}">${escapeHtml(String(result.status))} ${escapeHtml(result.statusText || "")}</span>
        <span class="chip">${escapeHtml(String(result.durationMs))} ms</span>
      </div>
      <div class="result-summary__actions">
        <span class="result-summary__hint">${escapeHtml(resultSummaryHint(result))}</span>
        <button class="button ghost" type="button" data-result-action="open" data-result-id="${escapeHtml(resultId)}">
          ${escapeHtml(uiLabels.results.open)}
        </button>
      </div>
    </div>
  `;
}

function setDrawerResultId(resultId) {
  const drawer = document.getElementById("result-drawer");
  if (!drawer) {
    return;
  }

  drawer
    .querySelectorAll("[data-result-action]")
    .forEach((button) => button.setAttribute("data-result-id", resultId || ""));
}

function syncResultDrawer(resultId) {
  const drawer = document.getElementById("result-drawer");
  const result = state.resultCache.get(resultId);
  if (!drawer || !result) {
    return;
  }

  const statusClass = resultStatusClass(result.status);
  const requestBody = prettyMaybeJson(result.requestBody) || uiLabels.runtime.empty;
  const responseBody = prettyMaybeJson(result.rawBody) || uiLabels.runtime.empty;
  const requestHeaders = prettyJson(result.requestHeaders);
  const responseHeaders = prettyJson(result.responseHeaders);
  const liveLog = result.liveLog || "";

  setDrawerResultId(resultId);
  state.activeResultId = resultId;
  setText("result-drawer-title", getResultTitle(resultId));
  setText("result-drawer-duration", `${result.durationMs} ms`);
  setText("result-drawer-url", result.url);
  setText("result-drawer-request-headers", requestHeaders);
  setText("result-drawer-request-body", requestBody);
  setText("result-drawer-response-headers", responseHeaders);
  setText("result-drawer-response-body", responseBody);

  const status = document.getElementById("result-drawer-status");
  if (status) {
    status.textContent = `${result.status} ${result.statusText || ""}`.trim();
    status.className = `status-pill ${statusClass}`;
  }

  const liveLogShell = document.getElementById("result-drawer-live-log-shell");
  const liveLogTarget = document.getElementById("result-drawer-live-log");
  if (liveLogShell && liveLogTarget) {
    if (liveLog) {
      liveLogShell.hidden = false;
      liveLogTarget.textContent = liveLog;
    } else {
      liveLogShell.hidden = true;
      liveLogTarget.textContent = uiLabels.results.noLiveLog;
    }
  }
}

function openResultDrawer(resultId) {
  if (!state.resultCache.has(resultId)) {
    return;
  }

  const drawer = document.getElementById("result-drawer");
  const backdrop = document.getElementById("result-drawer-backdrop");
  const closeButton = document.getElementById("result-drawer-close");
  if (!drawer || !backdrop) {
    return;
  }

  syncResultDrawer(resultId);
  drawer.hidden = false;
  backdrop.hidden = false;
  drawer.setAttribute("aria-hidden", "false");
  document.body.classList.add("drawer-open");
  closeButton?.focus();
}

function closeResultDrawer() {
  const drawer = document.getElementById("result-drawer");
  const backdrop = document.getElementById("result-drawer-backdrop");
  if (!drawer || !backdrop) {
    return;
  }

  drawer.hidden = true;
  backdrop.hidden = true;
  drawer.setAttribute("aria-hidden", "true");
  document.body.classList.remove("drawer-open");
  state.activeResultId = null;
  setDrawerResultId("");
}

function renderStreamInlineState() {
  const streamStatus = {
    opening: uiLabels.statusStrip.streamOpening,
    connected: uiLabels.statusStrip.streamConnected,
    closed: uiLabels.statusStrip.streamClosed,
    error: uiLabels.statusStrip.streamError,
    idle: uiLabels.statusStrip.streamIdle,
  }[state.streamStatus || "idle"];

  setText("stream-inline-state", streamStatus);
  setText("stream-inline-count", String(state.eventCount));
  setText(
    "stream-inline-last",
    state.lastEvent?.type || uiLabels.runtime.stateNotSet,
  );
}

function initializeBaseUrl() {
  const baseUrl = document.getElementById("base-url");
  if (!baseUrl) {
    return;
  }

  const currentValue = String(baseUrl.value || "").trim();
  const shouldHydrateFromWindow =
    !currentValue || currentValue === manualApiSpec.defaultBaseUrl;

  if (
    shouldHydrateFromWindow &&
    window.location.origin &&
    window.location.origin !== "null" &&
    shouldUseWindowOrigin(window.location)
  ) {
    baseUrl.value = window.location.origin;
  }
}

function shouldUseWindowOrigin(location) {
  if (!location || (location.protocol !== "http:" && location.protocol !== "https:")) {
    return false;
  }

  const pathname = location.pathname || "";
  const publishedRoutes = [
    manualApiSpec.publicDocsRoutes.en,
    `${manualApiSpec.publicDocsRoutes.en}/`,
    manualApiSpec.publicDocsRoutes.ptBR,
    `${manualApiSpec.publicDocsRoutes.ptBR}/`,
    "/manual-api-tests.html",
    "/manual-api-tests.pt-BR.html",
  ];
  if (publishedRoutes.includes(pathname)) {
    return true;
  }

  const hostname = String(location.hostname || "").toLowerCase();
  const isLoopback =
    hostname === "localhost" ||
    hostname === "127.0.0.1" ||
    hostname === "::1" ||
    hostname === "[::1]";
  const port = String(location.port || "");
  const isDefaultPort =
    port === "" ||
    (location.protocol === "http:" && port === "80") ||
    (location.protocol === "https:" && port === "443");

  if (isLoopback) {
    return isDefaultPort;
  }

  return true;
}

function initializeDefaults() {
  const accountKey = getField("accounts", "idempotencyKey");
  if (accountKey && !accountKey.value.trim()) {
    accountKey.value = crypto.randomUUID();
  }

  const webhookTimestamp = getField("webhook", "timestamp");
  if (webhookTimestamp && !webhookTimestamp.value) {
    webhookTimestamp.value = String(nowUnix());
  }
}

function wireActions() {
  document.addEventListener("click", async (event) => {
    const button = event.target.closest("button");
    if (!button) {
      return;
    }

    if (button.dataset.resultAction) {
      await handleResultAction(button);
      return;
    }

    if (button.dataset.playbookAction) {
      await handlePlaybookAction(button.dataset.playbookAction);
      return;
    }

    if (button.dataset.scenarioAction) {
      await handleScenarioAction(button.dataset.scenarioAction, button.dataset.routeId || "");
      return;
    }

    if (button.dataset.helperAction) {
      await handleHelperAction(button.dataset.helperAction, button.dataset.routeId || "");
    }
  });

  document.getElementById("use-latest-user-id").addEventListener("click", () => {
    if (state.lastAccount?.user?.id) {
      document.getElementById("jwt-user-id").value = state.lastAccount.user.id;
      savePersistedControls();
      renderContextStrip();
    }
  });

  document.getElementById("generate-jwt").addEventListener("click", generateLocalJwt);

  document.getElementById("clear-token").addEventListener("click", () => {
    document.getElementById("bearer-token").value = "";
    savePersistedControls();
    renderContextStrip();
    renderFlowProgress();
  });

  document.getElementById("copy-state").addEventListener("click", async () => {
    await copyText(
      JSON.stringify(
        {
          lastAccount: state.lastAccount,
          lastEvent: state.lastEvent,
          eventCount: state.eventCount,
          lastNotification: state.lastNotification,
        },
        null,
        2,
      ),
    );
  });

  document.getElementById("clear-state").addEventListener("click", () => {
    state.lastAccount = null;
    state.lastEvent = null;
    state.eventCount = 0;
    state.lastWebhookAcceptedAt = null;
    state.eventTypes.clear();
    renderSharedState();
    renderFlowProgress();
    recordActivity(
      uiExperience.runtime.activityTypes.system,
      uiExperience.runtime.stateCleared,
      uiExperience.context.description,
      "warning",
    );
  });

  document
    .getElementById("request-notification-permission")
    .addEventListener("click", () => requestNotificationPermission(true));

  document.getElementById("clear-notification-banner").addEventListener("click", () => {
    state.lastNotification = null;
    renderNotificationState();
  });

  const stackSweep = document.getElementById("stack-sweep");
  if (stackSweep) {
    stackSweep.addEventListener("click", () => void runHealthSweep({ silent: false }));
  }

  document.addEventListener("input", (event) => {
    const target = event.target;
    if (!(target instanceof HTMLElement) || !target.id) {
      return;
    }

    if (PERSISTED_CONTROL_IDS.has(target.id)) {
      savePersistedControls();
    }

    if (
      target.id === "base-url" ||
      target.id === "bearer-token" ||
      target.id === "jwt-user-id" ||
      target.id === "include-credentials"
    ) {
      renderContextStrip();
      renderFlowProgress();
    }
  });

  document.addEventListener("change", (event) => {
    const target = event.target;
    if (!(target instanceof HTMLElement) || !target.id) {
      return;
    }

    if (PERSISTED_CONTROL_IDS.has(target.id)) {
      savePersistedControls();
    }

    if (target.id === "include-credentials") {
      renderContextStrip();
    }
  });
}

function wireDomainNavigation() {
  const links = [...document.querySelectorAll("[data-domain-link]")];
  const sections = [...document.querySelectorAll("[data-domain-section]")];
  if (!links.length || !sections.length) return;

  const activate = (sectionId) => {
    for (const link of links) {
      const isActive = link.dataset.domainLink === sectionId;
      link.classList.toggle("is-active", isActive);
      if (isActive) {
        link.setAttribute("aria-current", "true");
      } else {
        link.removeAttribute("aria-current");
      }
    }
  };

  activate(sections[0].id);

  for (const link of links) {
    link.addEventListener("click", () => {
      activate(link.dataset.domainLink || "");
    });
  }

  if (!("IntersectionObserver" in window)) {
    return;
  }

  const observer = new IntersectionObserver(
    (entries) => {
      const visible = entries
        .filter((entry) => entry.isIntersecting)
        .sort((left, right) => right.intersectionRatio - left.intersectionRatio)[0];

      if (visible) {
        activate(visible.target.id);
      }
    },
    {
      rootMargin: "-18% 0px -58% 0px",
      threshold: [0.18, 0.35, 0.6],
    },
  );

  for (const section of sections) {
    observer.observe(section);
  }
}

async function handlePlaybookAction(action) {
  recordActivity(
    uiExperience.runtime.activityTypes.playbook,
    uiExperience.runtime.playbookRunning,
    action,
    "neutral",
  );

  switch (action) {
    case "playbook-account-create":
      await runAccountScenario("accounts", "create");
      break;
    case "playbook-arm-stream":
      if (!document.getElementById("jwt-user-id").value.trim() && state.lastAccount?.user?.id) {
        document.getElementById("jwt-user-id").value = state.lastAccount.user.id;
      }
      await generateLocalJwt();
      if (document.getElementById("bearer-token").value.trim()) {
        await connectEvents("events");
      }
      break;
    case "playbook-confirmed-webhook":
      if (!state.lastAccount?.payment?.paymentReference) {
        renderError(
          routeFieldId("webhook", "result"),
          uiLabels.runtime.noPaymentReferenceAvailable,
          uiLabels.runtime.createAccountFirst,
        );
        break;
      }
      await loadLatestPayment("webhook");
      await sendWebhookVariant("webhook", "confirmed");
      break;
    case "playbook-health-sweep":
      await runHealthSweep({ silent: false });
      break;
    default:
      break;
  }

  recordActivity(
    uiExperience.runtime.activityTypes.playbook,
    uiExperience.runtime.playbookFinished,
    action,
    "success",
  );
}

async function handleHelperAction(action, routeId) {
  switch (action) {
    case "generate-account-key":
      ensureAccountKey(routeId);
      return;
    case "disconnect-events":
      disconnectEvents(routeId);
      return;
    case "clear-events-log":
      clearEventsLog(routeId);
      return;
    case "load-latest-payment":
      await loadLatestPayment(routeId);
      return;
    case "refresh-webhook-timestamp":
      getField(routeId, "timestamp").value = String(nowUnix());
      await refreshWebhookSignature(routeId);
      return;
    case "generate-webhook-signature":
      await refreshWebhookSignature(routeId);
      return;
    case "clear-custom-body":
      getField(routeId, "body").value = "";
      return;
    default:
      return;
  }
}

async function handleScenarioAction(action, routeId) {
  switch (action) {
    case "account-create":
      await runAccountScenario(routeId, "create");
      return;
    case "account-replay":
      await runAccountScenario(routeId, "replay");
      return;
    case "account-conflict-prime":
      await runAccountScenario(routeId, "prime");
      return;
    case "account-conflict-replay":
      await runAccountScenario(routeId, "conflicting-replay");
      return;
    case "account-missing-key":
      await runAccountScenario(routeId, "missing-key");
      return;
    case "account-invalid-payload":
      await runAccountScenario(routeId, "invalid-payload");
      return;
    case "account-unsupported-currency":
      await runAccountScenario(routeId, "unsupported-currency");
      return;
    case "events-probe":
      await probeEvents(routeId);
      return;
    case "events-connect":
      await connectEvents(routeId);
      return;
    case "webhook-confirmed":
      await sendWebhookVariant(routeId, "confirmed");
      return;
    case "webhook-unsupported":
      await sendWebhookVariant(routeId, "unsupported");
      return;
    case "webhook-invalid-signature":
      await sendWebhookVariant(routeId, "invalid-signature");
      return;
    case "webhook-expired-signature":
      await sendWebhookVariant(routeId, "expired-signature");
      return;
    case "health-run":
      await runHealthProbe(routeId);
      return;
    case "custom-request":
      await runCustomRequest(routeId);
      return;
    default:
      return;
  }
}

function ensureAccountKey(routeId) {
  const input = getField(routeId, "idempotencyKey");
  if (input && !input.value.trim()) {
    input.value = crypto.randomUUID();
  }
  return input?.value.trim() || "";
}

async function runAccountScenario(routeId, mode) {
  const resultId = routeFieldId(routeId, "result");
  const headers = safeJsonParseObject(getField(routeId, "headers").value, resultId);
  if (!headers) return;

  const currentKey = getField(routeId, "idempotencyKey").value.trim();
  const idempotencyKey =
    mode === "missing-key" ? "" : currentKey || ensureAccountKey(routeId);

  if (mode !== "missing-key" && !idempotencyKey) {
    renderError(resultId, uiLabels.runtime.clientError, uiLabels.runtime.missingIdempotencyKey);
    return;
  }

  if (idempotencyKey) {
    headers["Idempotency-Key"] = idempotencyKey;
  }

  const payloadText = buildAccountPayloadText(routeId, mode);
  if (payloadText === null) return;

  const result = await runSimpleRequest({
    method: "POST",
    path: getField(routeId, "path").value.trim(),
    query: getField(routeId, "query").value.trim(),
    explicitHeaders: headers,
    bodyText: payloadText,
    resultId,
    accept: "application/json",
    contentType: "application/json",
  });

  if (!result) return;
  const parsedBody = tryParseJson(result.rawBody);
  if (result.status >= 200 && result.status < 300 && parsedBody?.user && parsedBody?.payment) {
    state.lastAccount = {
      ...parsedBody,
      idempotencyKey: idempotencyKey || null,
    };
    document.getElementById("jwt-user-id").value = parsedBody.user.id || "";
    savePersistedControls();
    renderSharedState();
    renderFlowProgress();
    renderContextStrip();
  }
}

function buildAccountPayloadText(routeId, mode) {
  const resultId = routeFieldId(routeId, "result");
  const payloadObject = safeJsonParseObject(getField(routeId, "payload").value, resultId);
  if (!payloadObject) return null;

  switch (mode) {
    case "invalid-payload":
      return JSON.stringify(defaultValues.invalidPayload, null, 2);
    case "unsupported-currency":
      return JSON.stringify(buildUnsupportedCurrencyPayload(payloadObject), null, 2);
    case "conflicting-replay":
      return JSON.stringify(buildConflictingReplayPayload(payloadObject), null, 2);
    default:
      return JSON.stringify(payloadObject, null, 2);
  }
}

function buildConflictingReplayPayload(basePayload) {
  const amount = Number(basePayload.amount);
  return {
    ...basePayload,
    name: basePayload.name ? `${basePayload.name} Replay` : "Replay Conflict",
    amount: Number.isFinite(amount) ? amount + 1 : 50,
  };
}

function buildUnsupportedCurrencyPayload(basePayload) {
  const seed = uniqueDigits(11);
  const emailToken = `${Date.now()}-${Math.floor(Math.random() * 100000)}`;
  return {
    ...basePayload,
    email: `manual.currency.${emailToken}@example.com`,
    name: basePayload.name ? `${basePayload.name} BTC` : "Currency Check BTC",
    cellphone: `55${uniqueDigits(11)}`,
    taxId: seed,
    amount: Number(basePayload.amount) > 0 ? Number(basePayload.amount) : 49,
    currency: "BTC",
  };
}

async function probeEvents(routeId) {
  const resultId = routeFieldId(routeId, "result");
  const controller = new AbortController();
  const headers = await buildHeaders({
    explicitHeaders: getField(routeId, "headers").value,
    accept: "text/event-stream",
    contentType: null,
    resultId,
    omitAuthorization: true,
  });
  if (!headers) return;

  const url = buildUrl(
    getField(routeId, "path").value.trim(),
    getField(routeId, "query").value.trim(),
  );
  const start = performance.now();

  try {
    const response = await fetch(url, {
      method: "GET",
      headers,
      credentials: "omit",
      signal: controller.signal,
    });
    const durationMs = Math.round(performance.now() - start);
    renderResult(resultId, {
      url,
      method: "GET",
      durationMs,
      status: response.status,
      statusText: response.statusText,
      requestHeaders: Object.fromEntries(headers.entries()),
      requestBody: "",
      responseHeaders: headersToObject(response.headers),
      rawBody: await response.text(),
    });
  } catch (error) {
    renderError(resultId, uiLabels.runtime.sseRequestFailed, error);
  } finally {
    controller.abort();
  }
}

async function connectEvents(routeId) {
  disconnectEvents(routeId);
  updateStreamStatus("opening");
  appendStreamLog(routeId, uiLabels.runtime.openingSse);

  const resultId = routeFieldId(routeId, "result");
  const controller = new AbortController();
  state.activeEventStream = { controller, routeId };

  const headers = await buildHeaders({
    explicitHeaders: getField(routeId, "headers").value,
    accept: "text/event-stream",
    contentType: null,
    resultId,
  });
  if (!headers) {
    state.activeEventStream = null;
    updateStreamStatus("error");
    return;
  }

  const url = buildUrl(
    getField(routeId, "path").value.trim(),
    getField(routeId, "query").value.trim(),
  );
  const start = performance.now();

  try {
    const response = await fetch(url, {
      method: "GET",
      headers,
      credentials: getCredentialsMode(),
      signal: controller.signal,
    });

    renderResult(resultId, {
      url,
      method: "GET",
      durationMs: Math.round(performance.now() - start),
      status: response.status,
      statusText: response.statusText,
      requestHeaders: Object.fromEntries(headers.entries()),
      requestBody: "",
      responseHeaders: headersToObject(response.headers),
      rawBody: response.ok ? uiLabels.runtime.sseConnected : await response.text(),
    });

    if (!response.ok || !response.body) {
      state.activeEventStream = null;
      updateStreamStatus("error");
      return;
    }

    updateStreamStatus("connected");
    recordActivity(
      uiExperience.runtime.activityTypes.stream,
      uiExperience.runtime.streamConnected,
      url,
      "success",
    );

    const reader = response.body.getReader();
    const decoder = new TextDecoder();
    let buffer = "";

    while (true) {
      const { value, done } = await reader.read();
      if (done) {
        appendStreamLog(routeId, uiLabels.runtime.sseClosedByServer);
        updateStreamStatus("closed");
        break;
      }
      buffer += decoder.decode(value, { stream: true });
      buffer = buffer.replace(/\r\n/g, "\n");
      buffer = consumeSseBuffer(buffer, (message) => {
        state.lastEvent = message;
        state.eventCount += 1;
        state.eventTypes.add(message.type || uiLabels.runtime.messageTypeFallback);
        renderSharedState();
        renderFlowProgress();
        appendStreamLog(
          routeId,
          `[${new Date().toISOString()}] ${message.type || uiLabels.runtime.messageTypeFallback}\n${message.formattedData}`,
        );
        recordActivity(
          uiExperience.runtime.activityTypes.stream,
          uiExperience.runtime.eventObserved,
          `${message.type || uiLabels.runtime.messageTypeFallback}`,
          "success",
        );
      });
    }
  } catch (error) {
    if (error?.name === "AbortError") {
      appendStreamLog(routeId, uiLabels.runtime.sseDisconnected);
      updateStreamStatus("closed");
      recordActivity(
        uiExperience.runtime.activityTypes.stream,
        uiExperience.runtime.streamDisconnected,
        routeId,
        "warning",
      );
    } else {
      appendStreamLog(routeId, `${uiLabels.runtime.sseErrorPrefix} ${String(error)}`);
      renderError(resultId, uiLabels.runtime.sseRequestFailed, error);
      updateStreamStatus("error");
    }
  } finally {
    state.activeEventStream = null;
  }
}

function disconnectEvents(routeId) {
  if (state.activeEventStream?.routeId === routeId) {
    state.activeEventStream.controller.abort();
    state.activeEventStream = null;
  }
  updateStreamStatus("closed");
}

function clearEventsLog(routeId) {
  const log = getField(routeId, "log");
  if (log) {
    log.textContent = uiLabels.runtime.noStreamActivityYet;
  }

  const resultId = routeFieldId(routeId, "result");
  const cached = state.resultCache.get(resultId);
  if (cached) {
    cached.liveLog = "";
    if (state.activeResultId === resultId) {
      syncResultDrawer(resultId);
    }
  }

  renderStreamInlineState();
}

async function loadLatestPayment(routeId) {
  const payment = state.lastAccount?.payment;
  const resultId = routeFieldId(routeId, "result");
  if (!payment) {
    renderError(resultId, uiLabels.runtime.noPaymentReferenceAvailable, uiLabels.runtime.createAccountFirst);
    return;
  }

  const payload = {
    eventId: crypto.randomUUID(),
    paymentReference: payment.paymentReference,
    amount: payment.amount,
    currency: payment.currency,
    status: "CONFIRMED",
    occurredAt: new Date().toISOString(),
  };
  getField(routeId, "payload").value = JSON.stringify(payload, null, 2);
  getField(routeId, "timestamp").value = String(nowUnix());
  await refreshWebhookSignature(routeId);
}

async function refreshWebhookSignature(routeId) {
  const resultId = routeFieldId(routeId, "result");
  try {
    const secret = getField(routeId, "secret").value;
    const timestamp = Number(getField(routeId, "timestamp").value);
    const payloadText = normalizeJsonString(getField(routeId, "payload").value);
    getField(routeId, "payload").value = prettyJson(payloadText);
    const bodyText = getField(routeId, "payload").value;
    const signature = await buildWebhookHeader(secret, timestamp, bodyText);
    getField(routeId, "signature").value = signature;
  } catch (error) {
    renderError(resultId, uiLabels.runtime.failedToGenerateWebhookSignature, error);
  }
}

async function sendWebhookVariant(routeId, mode) {
  const resultId = routeFieldId(routeId, "result");
  const path = getField(routeId, "path").value.trim();
  const headerName = getField(routeId, "headerName").value.trim();
  const secret = getField(routeId, "secret").value;
  const timestampField = getField(routeId, "timestamp");
  const payload = safeJsonParseObject(getField(routeId, "payload").value, resultId);
  if (!payload) return;

  payload.status = mode === "unsupported" ? "PENDING" : "CONFIRMED";

  let timestamp = Number(timestampField.value);
  if (!Number.isFinite(timestamp) || timestamp <= 0) {
    timestamp = nowUnix();
    timestampField.value = String(timestamp);
  }
  if (mode === "expired-signature") {
    timestamp = nowUnix() - 900;
    timestampField.value = String(timestamp);
  }
  if (!payload.eventId) {
    payload.eventId = crypto.randomUUID();
  }
  payload.occurredAt = payload.occurredAt || new Date().toISOString();

  const payloadText = JSON.stringify(payload, null, 2);
  getField(routeId, "payload").value = payloadText;

  let signature = await buildWebhookHeader(secret, timestamp, payloadText);
  if (mode === "invalid-signature") {
    signature = signature.replace(/.$/, signature.endsWith("0") ? "1" : "0");
  }
  getField(routeId, "signature").value = signature;

  const result = await runSimpleRequest({
    method: "POST",
    path,
    query: "",
    explicitHeaders: {
      [headerName]: signature,
    },
    bodyText: payloadText,
    resultId,
    accept: "application/json",
    contentType: "application/json",
  });

  if (!result) return;
  const responseBody = tryParseJson(result.rawBody);
  if (mode === "confirmed" && result.status === 202 && responseBody?.status === "accepted") {
    state.lastWebhookAcceptedAt = Date.now();
    renderFlowProgress();
    recordActivity(
      uiExperience.runtime.activityTypes.webhook,
      responseBody.status,
      payload.paymentReference || payload.eventId,
      "success",
    );
    emitPaymentNotification({
      eventId: payload.eventId,
      paymentReference: payload.paymentReference,
      amount: payload.amount,
      currency: payload.currency,
      status: payload.status,
      source: uiLabels.notification.messages.sourceWebhook,
    });
  }
}

async function runHealthProbe(routeId) {
  await runSimpleRequest({
    method: "GET",
    path: getField(routeId, "path").value.trim(),
    query: getField(routeId, "query").value.trim(),
    explicitHeaders: getField(routeId, "headers").value,
    bodyText: "",
    resultId: routeFieldId(routeId, "result"),
    accept: "application/json",
    contentType: null,
  });
}

async function runCustomRequest(routeId) {
  await runSimpleRequest({
    method: getField(routeId, "method").value,
    path: getField(routeId, "path").value.trim(),
    query: getField(routeId, "query").value.trim(),
    explicitHeaders: getField(routeId, "headers").value,
    bodyText: getField(routeId, "body").value,
    resultId: routeFieldId(routeId, "result"),
    accept: null,
    contentType: null,
  });
}

async function runSimpleRequest({
  method,
  path,
  query,
  explicitHeaders,
  bodyText,
  resultId,
  accept,
  contentType,
  includeCredentials,
  omitAuthorization,
}) {
  const headers = await buildHeaders({
    explicitHeaders,
    accept,
    contentType,
    resultId,
    omitAuthorization,
  });
  if (!headers) return null;

  const url = buildUrl(path, query);
  const requestBody = method === "GET" || method === "DELETE" ? "" : bodyText;
  const start = performance.now();

  try {
    const response = await fetch(url, {
      method,
      headers,
      body: requestBody || undefined,
      credentials: includeCredentials ?? getCredentialsMode(),
    });

    const rawBody = await response.text();
    const result = {
      url,
      method,
      durationMs: Math.round(performance.now() - start),
      status: response.status,
      statusText: response.statusText,
      requestHeaders: Object.fromEntries(headers.entries()),
      requestBody,
      responseHeaders: headersToObject(response.headers),
      rawBody,
    };

    renderResult(resultId, result);
    return result;
  } catch (error) {
    renderError(resultId, `${method} ${path} ${uiLabels.runtime.requestFailedSuffix}`, error);
    return null;
  }
}

async function buildHeaders({
  explicitHeaders,
  accept,
  contentType,
  resultId,
  omitAuthorization = false,
}) {
  const merged = new Headers();

  if (accept) {
    merged.set("Accept", accept);
  }
  if (contentType) {
    merged.set("Content-Type", contentType);
  }

  const globalHeaders = safeJsonParseObject(
    document.getElementById("global-headers").value,
    resultId,
    true,
  );
  if (globalHeaders === null) return null;
  for (const [key, value] of Object.entries(globalHeaders)) {
    if (value !== undefined && value !== null && value !== "") {
      merged.set(key, String(value));
    }
  }

  const requestHeaders = safeJsonParseObject(explicitHeaders || "{}", resultId, true);
  if (requestHeaders === null) return null;
  for (const [key, value] of Object.entries(requestHeaders)) {
    if (value !== undefined && value !== null && value !== "") {
      merged.set(key, String(value));
    }
  }

  const bearerToken = document.getElementById("bearer-token").value.trim();
  if (!omitAuthorization && bearerToken && !merged.has("Authorization")) {
    merged.set("Authorization", `Bearer ${bearerToken}`);
  }

  return merged;
}

function buildUrl(path, query) {
  const baseUrl = document.getElementById("base-url").value.trim();
  const target =
    path.startsWith("http://") || path.startsWith("https://")
      ? new URL(path)
      : new URL(path, ensureTrailingSlash(baseUrl));
  if (query) {
    target.search = query.startsWith("?") ? query : `?${query}`;
  }
  return target.toString();
}

function ensureTrailingSlash(value) {
  return value.endsWith("/") ? value : `${value}/`;
}

function getCredentialsMode() {
  return document.getElementById("include-credentials").checked ? "include" : "omit";
}

function renderResult(resultId, result) {
  if (resultId === routeFieldId("events", "result")) {
    const log = getField("events", "log")?.textContent || "";
    result.liveLog = log === uiLabels.runtime.noStreamActivityYet ? "" : log;
  }

  state.resultCache.set(resultId, result);
  renderResultSummary(resultId, result);
  openResultDrawer(resultId);

  recordActivity(
    uiExperience.runtime.activityTypes.request,
    uiExperience.runtime.requestCaptured,
    `${result.method} ${trimDisplayUrl(result.url)} -> ${result.status}`,
    resultStatusClass(result.status) === "ok"
      ? "success"
      : resultStatusClass(result.status) === "warn"
        ? "warning"
        : "danger",
  );
}

function renderError(resultId, message, error) {
  renderResult(resultId, {
    url: uiLabels.runtime.notApplicable,
    method: uiLabels.runtime.notApplicable,
    durationMs: 0,
    status: 0,
    statusText: uiLabels.runtime.clientError,
    requestHeaders: {},
    requestBody: "",
    responseHeaders: {},
    rawBody: `${message}\n\n${String(error)}`,
  });
}

async function handleResultAction(button) {
  const { resultAction, resultId } = button.dataset;
  if (!resultId) return;

  if (resultAction === "open") {
    openResultDrawer(resultId);
    return;
  }

  if (resultAction === "clear") {
    state.resultCache.delete(resultId);
    renderEmptyResult(resultId);
    if (state.activeResultId === resultId) {
      closeResultDrawer();
    }
    return;
  }

  const cached = state.resultCache.get(resultId);
  if (!cached) return;

  if (resultAction === "copy-body") {
    await copyText(prettyMaybeJson(cached.rawBody));
    return;
  }

  if (resultAction === "copy-full") {
    await copyText(buildCopyPayload(cached));
  }
}

function renderSharedState() {
  const account = state.lastAccount;
  setText("state-user-id", account?.user?.id || uiLabels.runtime.stateNotSet);
  setText("state-payment-id", account?.payment?.id || uiLabels.runtime.stateNotSet);
  setText(
    "state-payment-reference",
    account?.payment?.paymentReference || uiLabels.runtime.stateNotSet,
  );
  setText("state-idempotency-key", account?.idempotencyKey || uiLabels.runtime.stateNotSet);
  setText(
    "state-correlation-id",
    account?.meta?.correlationId || uiLabels.runtime.stateNotSet,
  );
  setText(
    "state-last-event",
    state.lastEvent
      ? `${state.lastEvent.type || uiLabels.runtime.messageTypeFallback} (#${state.eventCount})`
      : uiLabels.runtime.stateNotSet,
  );
  renderStreamInlineState();
}

function setText(id, value) {
  const target = document.getElementById(id);
  if (target) {
    target.textContent = value;
  }
}

function appendStreamLog(routeId, message) {
  const log = getField(routeId, "log");
  if (!log) return;
  if (log.textContent === uiLabels.runtime.noStreamActivityYet) {
    log.textContent = message;
  } else {
    log.textContent += `\n\n${message}`;
  }
  log.scrollTop = log.scrollHeight;

  const resultId = routeFieldId(routeId, "result");
  const cached = state.resultCache.get(resultId);
  if (cached) {
    cached.liveLog = log.textContent;
    if (state.activeResultId === resultId) {
      syncResultDrawer(resultId);
    }
  }

  renderStreamInlineState();
}

function consumeSseBuffer(buffer, onEvent) {
  let boundaryIndex = buffer.indexOf("\n\n");
  while (boundaryIndex !== -1) {
    const rawChunk = buffer.slice(0, boundaryIndex).replace(/\r/g, "");
    buffer = buffer.slice(boundaryIndex + 2);
    boundaryIndex = buffer.indexOf("\n\n");

    if (!rawChunk.trim()) continue;

    const event = {
      id: "",
      type: uiLabels.runtime.messageTypeFallback,
      dataLines: [],
    };

    for (const line of rawChunk.split("\n")) {
      if (!line || line.startsWith(":")) continue;
      const separator = line.indexOf(":");
      const field = separator === -1 ? line : line.slice(0, separator);
      let value = separator === -1 ? "" : line.slice(separator + 1);
      if (value.startsWith(" ")) value = value.slice(1);

      if (field === "id") event.id = value;
      if (field === "event") event.type = value;
      if (field === "data") event.dataLines.push(value);
    }

    const rawData = event.dataLines.join("\n");
    const parsedData = tryParseJson(rawData);
    onEvent({
      id: event.id,
      type: event.type,
      rawData,
      parsedData,
      formattedData: parsedData ? JSON.stringify(parsedData, null, 2) : rawData,
    });
  }

  return buffer;
}

async function generateLocalJwt() {
  const userId = document.getElementById("jwt-user-id").value.trim();
  const secret = document.getElementById("jwt-secret").value;
  if (!userId) {
    renderError("events--result", uiLabels.runtime.cannotGenerateJwt, uiLabels.runtime.provideUserIdFirst);
    return;
  }

  try {
    const token = await signJwtHs256(
      {
        sub: userId,
        exp: Math.floor(Date.now() / 1000) + 3600,
      },
      secret,
    );
    document.getElementById("bearer-token").value = token;
    savePersistedControls();
    renderContextStrip();
    renderFlowProgress();
  } catch (error) {
    renderError("events--result", uiLabels.runtime.jwtGenerationFailed, error);
  }
}

async function initializeNotifications() {
  await requestNotificationPermission(false);
}

async function requestNotificationPermission(showToastOnError) {
  if (!isNotificationAvailable()) {
    state.notificationStatus = "unsupported";
    state.notificationMessage = uiLabels.notification.messages.unsupported;
    renderNotificationState();
    return;
  }

  try {
    if (Notification.permission === "default") {
      const permission = await Notification.requestPermission();
      state.notificationStatus = mapNotificationPermission(permission);
    } else {
      state.notificationStatus = mapNotificationPermission(Notification.permission);
    }
  } catch (error) {
    state.notificationStatus = "error";
    state.notificationMessage = uiLabels.notification.messages.error;
    renderNotificationState();
    if (showToastOnError) {
      showToast(uiLabels.notification.states.error, String(error), "warning");
    }
    return;
  }

  state.notificationMessage = notificationStatusMessage(state.notificationStatus);
  renderNotificationState();
}

function isNotificationAvailable() {
  if (!("Notification" in window)) return false;
  if (window.isSecureContext) return true;

  const hostname = String(window.location.hostname || "").toLowerCase();
  return (
    hostname === "localhost" ||
    hostname === "127.0.0.1" ||
    hostname === "::1" ||
    hostname === "[::1]"
  );
}

function mapNotificationPermission(permission) {
  if (permission === "granted") return "granted";
  if (permission === "denied") return "blocked";
  return "default";
}

function notificationStatusMessage(status) {
  switch (status) {
    case "granted":
      return uiLabels.notification.messages.granted;
    case "blocked":
      return uiLabels.notification.messages.blocked;
    case "unsupported":
      return uiLabels.notification.messages.unsupported;
    case "error":
      return uiLabels.notification.messages.error;
    default:
      return uiLabels.notification.messages.default;
  }
}

function renderNotificationState() {
  const pill = document.getElementById("notification-status-pill");
  const text = document.getElementById("notification-status-text");
  const lastMessage = document.getElementById("notification-last-message");
  const banner = document.getElementById("notification-fallback-banner");

  const effectiveStatus = state.notificationStatus || "default";
  pill.textContent =
    uiLabels.notification.states[effectiveStatus] || uiLabels.notification.states.default;
  pill.className = `status-pill ${notificationClassForStatus(effectiveStatus)}`;
  text.textContent = state.notificationMessage || notificationStatusMessage(effectiveStatus);
  lastMessage.textContent = state.lastNotification
    ? formatNotificationSummary(state.lastNotification)
    : uiLabels.notification.messages.empty;

  banner.className = `alert-banner ${notificationBannerClass(effectiveStatus)}`;
  banner.textContent =
    state.lastNotification && effectiveStatus !== "granted"
      ? formatNotificationSummary(state.lastNotification)
      : notificationStatusMessage(effectiveStatus);

  renderContextStrip();
}

function notificationClassForStatus(status) {
  switch (status) {
    case "granted":
      return "ok";
    case "blocked":
    case "error":
      return "bad";
    case "unsupported":
      return "warn";
    default:
      return "neutral";
  }
}

function notificationBannerClass(status) {
  switch (status) {
    case "granted":
      return "success";
    case "blocked":
    case "error":
      return "danger";
    default:
      return "info";
  }
}

function emitPaymentNotification(details) {
  const dedupeKey = `${details.paymentReference}:${details.status}`;
  const lastAt = state.notificationDedupe.get(dedupeKey);
  if (lastAt && Date.now() - lastAt < 2500) {
    return;
  }
  state.notificationDedupe.set(dedupeKey, Date.now());

  const amountText = formatCurrency(details.amount, details.currency);
  const summary = [
    `${uiLabels.notification.messages.referenceLabel}: ${details.paymentReference || "-"}`,
    `${uiLabels.notification.messages.amountLabel}: ${amountText}`,
    `${uiLabels.notification.messages.statusLabel}: ${details.status || "-"}`,
    `${uiLabels.notification.messages.sourceLabel}: ${details.source || uiLabels.notification.messages.sourceWebhook}`,
  ].join(" | ");

  state.lastNotification = {
    title: uiLabels.notification.messages.title,
    summary,
    at: new Date().toISOString(),
  };
  renderNotificationState();
  showToast(
    uiLabels.notification.messages.title,
    summary,
    state.notificationStatus === "granted" ? "success" : "warning",
  );

  if (state.notificationStatus === "granted" && "Notification" in window) {
    try {
      const notification = new Notification(uiLabels.notification.messages.title, {
        body: summary,
        tag: `payment-confirmed:${details.paymentReference || details.eventId || crypto.randomUUID()}`,
      });
      setTimeout(() => notification.close(), 6000);
    } catch {
      state.notificationStatus = "error";
      state.notificationMessage = uiLabels.notification.messages.error;
      renderNotificationState();
    }
  }
}

function formatNotificationSummary(notification) {
  return `[${notification.at}] ${notification.title} | ${notification.summary}`;
}

function showToast(title, body, tone) {
  const stack = document.getElementById("toast-stack");
  if (!stack) return;

  const toast = document.createElement("article");
  toast.className = `toast ${tone}`;
  toast.innerHTML = `
    <h4>${escapeHtml(title)}</h4>
    <p>${escapeHtml(body)}</p>
  `;
  stack.appendChild(toast);

  setTimeout(() => {
    toast.classList.add("fade-out");
    setTimeout(() => toast.remove(), 220);
  }, 5200);
}

function formatCurrency(amount, currency) {
  try {
    return new Intl.NumberFormat(uiCopy.localeCode, {
      style: "currency",
      currency: String(currency || "USD").toUpperCase(),
    }).format(Number(amount));
  } catch {
    return `${amount} ${currency}`.trim();
  }
}

async function signJwtHs256(payload, secret) {
  const header = { alg: "HS256", typ: "JWT" };
  const encodedHeader = base64UrlEncode(JSON.stringify(header));
  const encodedPayload = base64UrlEncode(JSON.stringify(payload));
  const unsignedToken = `${encodedHeader}.${encodedPayload}`;
  const key = await crypto.subtle.importKey(
    "raw",
    new TextEncoder().encode(secret),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"],
  );
  const signatureBuffer = await crypto.subtle.sign(
    "HMAC",
    key,
    new TextEncoder().encode(unsignedToken),
  );
  const signature = base64UrlEncodeBytes(new Uint8Array(signatureBuffer));
  return `${unsignedToken}.${signature}`;
}

async function buildWebhookHeader(secret, timestamp, bodyText) {
  const payload = `${timestamp}.${bodyText}`;
  const key = await crypto.subtle.importKey(
    "raw",
    new TextEncoder().encode(secret),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"],
  );
  const signatureBuffer = await crypto.subtle.sign(
    "HMAC",
    key,
    new TextEncoder().encode(payload),
  );
  const signatureHex = Array.from(new Uint8Array(signatureBuffer))
    .map((value) => value.toString(16).padStart(2, "0"))
    .join("");
  return `t=${timestamp},v1=${signatureHex}`;
}

function normalizeJsonString(value) {
  const parsed = JSON.parse(value);
  return JSON.stringify(parsed);
}

function prettyMaybeJson(value) {
  if (!value) return "";
  const parsed = tryParseJson(value);
  if (parsed !== null) {
    return JSON.stringify(parsed, null, 2);
  }
  return String(value);
}

function prettyJson(value) {
  if (typeof value === "string") {
    const parsed = tryParseJson(value);
    return parsed !== null ? JSON.stringify(parsed, null, 2) : value;
  }
  return JSON.stringify(value, null, 2);
}

function tryParseJson(value) {
  if (value === "" || value === null || value === undefined) return null;
  if (typeof value !== "string") return value;
  try {
    return JSON.parse(value);
  } catch {
    return null;
  }
}

function safeJsonParseObject(raw, resultId, renderOnError = true) {
  try {
    if (raw && typeof raw === "object" && !Array.isArray(raw)) {
      return raw;
    }
    if (!raw || !String(raw).trim()) return {};
    const parsed = JSON.parse(raw);
    if (parsed && typeof parsed === "object" && !Array.isArray(parsed)) {
      return parsed;
    }
    throw new Error(uiLabels.runtime.jsonObjectRequired);
  } catch (error) {
    if (renderOnError) {
      renderError(resultId, uiLabels.runtime.invalidJsonInput, error);
    }
    return null;
  }
}

function headersToObject(headers) {
  const result = {};
  headers.forEach((value, key) => {
    result[key] = value;
  });
  return result;
}

async function runHealthSweep({ silent }) {
  const serviceIds = Object.keys(HEALTH_SERVICE_MAP);
  for (const serviceId of serviceIds) {
    state.healthPulse.set(serviceId, {
      status: "checking",
      detail: uiLabels.health.checking,
    });
  }
  renderStackPulse();

  if (!silent) {
    recordActivity(
      uiExperience.runtime.activityTypes.health,
      uiLabels.health.running,
      trimDisplayUrl(document.getElementById("base-url").value),
      "warning",
    );
  }

  const endpointMap = new Map(manualApiSpec.healthEndpoints.map((endpoint) => [endpoint.id, endpoint]));
  let degradedCount = 0;

  for (const [serviceId, routeIds] of Object.entries(HEALTH_SERVICE_MAP)) {
    const live = await fetchHealthEndpoint(endpointMap.get(routeIds.live));
    const ready = await fetchHealthEndpoint(endpointMap.get(routeIds.ready));
    const status = evaluateHealthStatus(live, ready);
    if (status !== "up") {
      degradedCount += 1;
    }
    state.healthPulse.set(serviceId, {
      status,
      detail: formatHealthDetail(live, ready),
      live,
      ready,
    });
  }

  state.lastSweepAt = Date.now();
  renderStackPulse();
  renderFlowProgress();

  if (!silent) {
    const tone = degradedCount === 0 ? "success" : "warning";
    const message = degradedCount === 0 ? uiLabels.health.done : uiLabels.health.partial;
    showToast(uiLabels.health.title, message, tone);
    recordActivity(
      uiExperience.runtime.activityTypes.health,
      message,
      `${serviceIds.length} ${uiLabels.health.title.toLowerCase()}`,
      tone,
    );
  }
}

async function fetchHealthEndpoint(endpoint) {
  if (!endpoint) {
    return { ok: false, status: 0, statusText: "missing", durationMs: 0 };
  }

  const url = buildUrl(endpoint.path, "");
  const controller = new AbortController();
  const start = performance.now();
  const timeout = setTimeout(() => controller.abort(), 4500);

  try {
    const response = await fetch(url, {
      method: endpoint.method,
      headers: { Accept: "application/json" },
      credentials: getCredentialsMode(),
      signal: controller.signal,
    });
    clearTimeout(timeout);
    return {
      ok: response.ok,
      status: response.status,
      statusText: response.statusText,
      durationMs: Math.round(performance.now() - start),
    };
  } catch (error) {
    clearTimeout(timeout);
    return {
      ok: false,
      status: 0,
      statusText: error?.name === "AbortError" ? "timeout" : "error",
      durationMs: Math.round(performance.now() - start),
    };
  }
}

function evaluateHealthStatus(live, ready) {
  if (live.ok && ready.ok) return "up";
  if (live.ok || ready.ok) return "degraded";
  return "down";
}

function formatHealthDetail(live, ready) {
  return `live ${live.status || 0} / ready ${ready.status || 0}`;
}

function renderStackPulse() {
  const serviceIds = Object.keys(HEALTH_SERVICE_MAP);
  for (const serviceId of serviceIds) {
    const pulse = state.healthPulse.get(serviceId) || {
      status: "idle",
      detail: uiLabels.health.idle,
    };
    const statusElement = document.getElementById(`health-${serviceId}-status`);
    const detailElement = document.getElementById(`health-${serviceId}-detail`);
    if (statusElement) {
      statusElement.textContent = uiLabels.health[pulse.status] || uiLabels.health.idle;
      statusElement.className = `status-pill ${healthStatusClass(pulse.status)}`;
    }
    if (detailElement) {
      detailElement.textContent = pulse.detail;
    }
  }

  setText(
    "stack-sweep-timestamp",
    state.lastSweepAt
      ? new Date(state.lastSweepAt).toLocaleTimeString(uiCopy.localeCode, {
          hour: "2-digit",
          minute: "2-digit",
          second: "2-digit",
        })
      : uiLabels.health.idle,
  );
}

function healthStatusClass(status) {
  switch (status) {
    case "up":
      return "ok";
    case "degraded":
      return "warn";
    case "down":
      return "bad";
    default:
      return "neutral";
  }
}

function renderFlowProgress() {
  const healthGateway = state.healthPulse.get("gateway")?.status || "idle";
  const hasToken = Boolean(document.getElementById("bearer-token").value.trim());
  const hasCookieFlow = Boolean(
    document.getElementById("include-credentials").checked && state.lastAccount,
  );
  const hasPaymentEvent = state.eventTypes.has("payment.status-updated");
  const hasPremiumEvent = state.eventTypes.has("user.premium-updated");

  const steps = {
    edge:
      healthGateway === "up"
        ? "done"
        : healthGateway === "checking"
          ? "live"
          : healthGateway === "down"
            ? "warn"
            : "idle",
    account: state.lastAccount ? "done" : "idle",
    auth: hasToken || hasCookieFlow ? "done" : state.lastAccount ? "warn" : "idle",
    stream:
      state.streamStatus === "connected"
        ? "done"
        : state.streamStatus === "opening"
          ? "live"
          : state.streamStatus === "error"
            ? "warn"
            : "idle",
    webhook: state.lastWebhookAcceptedAt ? "done" : state.lastAccount ? "warn" : "idle",
    payment:
      hasPaymentEvent
        ? "done"
        : state.lastWebhookAcceptedAt
          ? "live"
          : "idle",
    premium:
      hasPremiumEvent
        ? "done"
        : hasPaymentEvent
          ? "live"
          : "idle",
  };

  for (const [stepId, status] of Object.entries(steps)) {
    const pill = document.getElementById(`flow-step-${stepId}-status`);
    if (!pill) continue;
    pill.textContent = uiExperience.flowProgress.states[status];
    pill.className = `status-pill ${progressStatusClass(status)}`;
  }
}

function progressStatusClass(status) {
  switch (status) {
    case "done":
      return "ok";
    case "live":
      return "warn";
    case "warn":
      return "bad";
    default:
      return "neutral";
  }
}

function renderContextStrip() {
  const baseUrl = document.getElementById("base-url").value.trim();
  const includeCredentials = document.getElementById("include-credentials").checked;
  const bearerToken = document.getElementById("bearer-token").value.trim();

  setText("context-base-url", trimDisplayUrl(baseUrl || manualApiSpec.defaultBaseUrl));
  setText(
    "context-credentials",
    includeCredentials ? uiLabels.statusStrip.credentialsOn : uiLabels.statusStrip.credentialsOff,
  );

  setText(
    "context-auth",
    bearerToken && includeCredentials
      ? uiLabels.statusStrip.authHybrid
      : bearerToken
        ? uiLabels.statusStrip.authBearer
        : uiLabels.statusStrip.authAnonymous,
  );

  const notificationKey = {
    granted: "notificationsGranted",
    blocked: "notificationsBlocked",
    unsupported: "notificationsUnsupported",
    error: "notificationsError",
    default: "notificationsDefault",
  }[state.notificationStatus || "default"];
  setText("context-notifications", uiLabels.statusStrip[notificationKey]);

  const streamKey = {
    opening: "streamOpening",
    connected: "streamConnected",
    closed: "streamClosed",
    error: "streamError",
    idle: "streamIdle",
  }[state.streamStatus || "idle"];
  setText("context-stream", uiLabels.statusStrip[streamKey]);
}

function updateStreamStatus(nextStatus) {
  state.streamStatus = nextStatus;
  renderStreamInlineState();
  renderContextStrip();
  renderFlowProgress();
}

function recordActivity(kind, title, detail, tone = "neutral") {
  state.activityFeed.unshift({
    kind,
    title,
    detail,
    tone,
    at: new Date(),
  });
  state.activityFeed = state.activityFeed.slice(0, 10);
  renderActivityFeed();
}

function renderActivityFeed() {
  const container = document.getElementById("activity-feed-list");
  if (!container) return;

  if (!state.activityFeed.length) {
    container.innerHTML = `
      <article class="activity-item activity-item--empty">
        <div>
          <h3>${escapeHtml(uiExperience.activity.labels.recent)}</h3>
          <p>${escapeHtml(uiExperience.activity.empty)}</p>
        </div>
      </article>
    `;
    return;
  }

  container.innerHTML = state.activityFeed
    .map((item) => {
      const toneClass =
        item.tone === "success"
          ? "ok"
          : item.tone === "warning"
            ? "warn"
            : item.tone === "danger"
              ? "bad"
              : "neutral";

      return `
        <article class="activity-item">
          <div class="activity-item__top">
            <h3>${escapeHtml(item.title)}</h3>
            <span class="status-pill ${toneClass}">${escapeHtml(item.kind)}</span>
          </div>
          <p>${escapeHtml(item.detail)}</p>
          <span class="activity-item__meta">${escapeHtml(
            item.at.toLocaleTimeString(uiCopy.localeCode, {
              hour: "2-digit",
              minute: "2-digit",
              second: "2-digit",
            }),
          )}</span>
        </article>
      `;
    })
    .join("");
}

function trimDisplayUrl(value) {
  if (!value) return manualApiSpec.defaultBaseUrl;
  try {
    const parsed = new URL(value);
    return `${parsed.protocol}//${parsed.host}`;
  } catch {
    return value;
  }
}

function nowUnix() {
  return Math.floor(Date.now() / 1000);
}

function uniqueDigits(length) {
  const seed = `${Date.now()}${Math.floor(Math.random() * 100000)}`;
  return seed.slice(-length).padStart(length, "0");
}

async function copyText(value) {
  if (!navigator.clipboard?.writeText) {
    showToast(uiLabels.common.clipboard, uiLabels.runtime.clipboardUnavailable, "warning");
    return;
  }

  await navigator.clipboard.writeText(value);
  showToast(uiLabels.common.clipboard, uiLabels.common.copied, "success");
  recordActivity(
    uiExperience.runtime.activityTypes.clipboard,
    uiLabels.common.copied,
    `${String(value).slice(0, 72)}${String(value).length > 72 ? "..." : ""}`,
    "success",
  );
}

function base64UrlEncode(value) {
  return base64UrlEncodeBytes(new TextEncoder().encode(value));
}

function base64UrlEncodeBytes(bytes) {
  let binary = "";
  bytes.forEach((byte) => {
    binary += String.fromCharCode(byte);
  });
  return btoa(binary).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/g, "");
}

function persistStorageKey() {
  return `modularis.manualApiConsole.${uiCopy.localeCode}`;
}

function restorePersistedControls() {
  try {
    const raw = window.localStorage.getItem(persistStorageKey());
    if (!raw) return;
    const parsed = JSON.parse(raw);
    if (!parsed || typeof parsed !== "object") return;

    for (const [id, value] of Object.entries(parsed)) {
      const element = document.getElementById(id);
      if (!element) continue;
      if (element instanceof HTMLInputElement && element.type === "checkbox") {
        element.checked = Boolean(value);
      } else if (
        element instanceof HTMLInputElement ||
        element instanceof HTMLTextAreaElement ||
        element instanceof HTMLSelectElement
      ) {
        element.value = String(value);
      }
    }
  } catch {
    // Ignore malformed local storage payloads.
  }
}

function savePersistedControls() {
  try {
    const payload = {};
    for (const id of PERSISTED_CONTROL_IDS) {
      const element = document.getElementById(id);
      if (!element) continue;
      if (element instanceof HTMLInputElement && element.type === "checkbox") {
        payload[id] = element.checked;
      } else if (
        element instanceof HTMLInputElement ||
        element instanceof HTMLTextAreaElement ||
        element instanceof HTMLSelectElement
      ) {
        payload[id] = element.value;
      }
    }
    window.localStorage.setItem(persistStorageKey(), JSON.stringify(payload));
  } catch {
    // Ignore storage failures in restricted contexts.
  }
}

function escapeHtml(value) {
  return String(value)
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#39;");
}
