import { readFile, writeFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import {
  defaultValues,
  locales,
  manualApiSpec,
} from "./manual-api-console.data.mjs";

const currentDir = dirname(fileURLToPath(import.meta.url));
const repoRoot = resolve(currentDir, "../..");
const docsDir = resolve(repoRoot, "docs", "demos", "manual-api");
const stylesPath = resolve(currentDir, "manual-api-console.styles.css");
const runtimePath = resolve(currentDir, "manual-api-console.runtime.js");

function escapeHtml(value) {
  return String(value)
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#39;");
}

function scriptJson(value) {
  return JSON.stringify(value).replace(/</g, "\\u003c");
}

function prettyJson(value) {
  return JSON.stringify(value, null, 2);
}

function routeFieldId(routeId, field) {
  return `${routeId}--${field}`;
}

function getRuntimeCopy(copy) {
  return {
    localeCode: copy.localeCode,
    fileName: copy.fileName,
    publicRoute: copy.publicRoute,
    routes: Object.fromEntries(
      Object.keys(copy.routes).map((routeId) => [routeId, { id: routeId }]),
    ),
  };
}

function getRuntimeExperience(copy) {
  if (copy.localeCode === "pt-BR") {
    return {
      context: {
        description: "demo de fluxos",
      },
      runtime: {
        stateCleared: "Estado limpo",
        playbookRunning: "Ação em andamento",
        playbookFinished: "Ação concluída",
        streamConnected: "Stream conectado",
        streamDisconnected: "Stream desconectado",
        eventObserved: "Evento recebido",
        requestCaptured: "Requisição concluída",
        activityTypes: {
          system: "Sistema",
          playbook: "Ação",
          request: "HTTP",
          stream: "SSE",
          webhook: "Webhook",
          health: "Health",
          clipboard: "Clipboard",
        },
      },
      flowProgress: {
        states: {
          idle: "Aguardando",
          live: "Ao vivo",
          done: "Concluído",
          warn: "Atenção",
        },
      },
      activity: {
        labels: {
          recent: "Recente",
        },
        empty: "Nenhuma atividade ainda.",
      },
    };
  }

  return {
    context: {
      description: "flow demo",
    },
    runtime: {
      stateCleared: "State cleared",
      playbookRunning: "Action running",
      playbookFinished: "Action finished",
      streamConnected: "Stream connected",
      streamDisconnected: "Stream disconnected",
      eventObserved: "Event received",
      requestCaptured: "Request completed",
      activityTypes: {
        system: "System",
        playbook: "Action",
        request: "HTTP",
        stream: "SSE",
        webhook: "Webhook",
        health: "Health",
        clipboard: "Clipboard",
      },
    },
    flowProgress: {
      states: {
        idle: "Waiting",
        live: "Live",
        done: "Done",
        warn: "Attention",
      },
    },
    activity: {
      labels: {
        recent: "Recent",
      },
      empty: "No activity yet.",
    },
  };
}

function getInterfaceCopy(copy) {
  if (copy.localeCode === "pt-BR") {
    return {
      pageTitle: "Demo de Fluxos Modularis",
      brand: "Modularis Sandbox",
      topbarEyebrow: "demo rápida de microsserviços",
      localeCurrent: "PT-BR",
      localeAlternate: "EN",
      localeHref: manualApiSpec.publicDocsRoutes.en,
      heroEyebrow: "sandbox / demo",
      heroSummary:
        "Crie uma conta, abra o stream e confirme um webhook em poucos cliques.",
      heroActions: {
        create: "Criar conta",
        stream: "Abrir stream",
        webhook: "Confirmar webhook",
      },
      heroChips: ["stack local", "serviços reais"],
      contextLabel: "Contexto rápido",
      context: {
        base: "Base",
        auth: "Autenticação",
        stream: "Stream",
        alerts: "Alertas",
      },
      sessionTitle: "Sessão",
      sessionSummary: "Base, autenticação e estado rápido.",
      labels: {
        baseUrl: "Base URL",
        cookies: "Usar cookies do navegador",
        globalHeaders: "Headers globais",
        auth: "Autenticação",
        bearerToken: "Token Bearer",
        userId: "ID do usuário",
        jwtSecret: "Segredo do JWT",
        alerts: "Alertas",
        state: "Estado",
        lastUserId: "Último ID de usuário",
        lastPaymentReference: "Última referência de pagamento",
        lastEvent: "Último evento",
        idempotencyKey: "Idempotency-Key",
        payload: "Payload JSON",
        path: "Path",
        query: "Query",
        extraHeaders: "Headers",
        requestOptions: "Ajustes da requisição",
        signatureOptions: "Assinatura",
        signatureHeader: "Header de assinatura",
        timestamp: "Timestamp",
        sharedSecret: "Segredo compartilhado",
        computedSignature: "Assinatura",
        method: "Método",
        pathOrUrl: "Path ou URL",
        body: "Corpo",
        liveLog: "Log ao vivo",
        streamState: "Status do stream",
        eventCount: "Eventos",
        latestEvent: "Último",
      },
      buttons: {
        authDetails: "Autenticação",
        alertsDetails: "Alertas",
        stateDetails: "Estado",
        enableAlerts: "Ativar alertas",
        clearAlert: "Limpar",
        copyState: "Copiar estado",
        clearState: "Limpar estado",
        generateJwt: "Gerar JWT",
        useLatestUserId: "Último ID",
        clearToken: "Limpar token",
        generateKey: "Gerar chave",
        loadLatestPayment: "Usar último pagamento",
        refreshTimestamp: "Atualizar horário",
        generateSignature: "Gerar assinatura",
        disconnect: "Fechar stream",
        clearLog: "Limpar log",
        sendRequest: "Enviar",
        clearBody: "Limpar corpo",
        advanced: "Ferramentas avançadas",
        healthSweep: "Ver serviços",
        healthRun: "Executar",
      },
      placeholders: {
        bearerToken: "Cole um JWT aqui",
        jwtUserId: "UUID do usuário",
        query: "foo=bar",
        queryCustom: "foo=bar&limit=1",
        optionalBody: "Corpo opcional",
      },
      notification: {
        default: "Ative as notificações se quiser alertas nativos.",
        empty: "Nenhum alerta ainda.",
        note: "Se o navegador bloquear, o aviso continua visível na página.",
      },
      stateEmpty: "não definido",
      streamEmpty: "Nenhuma atividade no stream ainda.",
      resultEmpty: "Nenhum teste executado.",
      drawerTitle: "Último resultado",
      drawerLabels: {
        title: "Detalhe",
        request: "Requisição",
        response: "Resposta",
        requestHeaders: "Headers",
        requestBody: "Corpo",
        responseHeaders: "Headers",
        responseBody: "Corpo",
        liveLog: "Log do stream",
        url: "URL",
      },
      drawerButtons: {
        close: "Fechar",
        copyBody: "Copiar corpo",
        copyFull: "Copiar tudo",
        clear: "Limpar",
      },
      flowStackLabel: "Fluxos principais",
      mainFlows: {
        accounts: {
          step: "01",
          title: "Criar conta",
          summary: "Dispara o onboarding e cria a intenção de pagamento.",
        },
        events: {
          step: "02",
          title: "Abrir stream",
          summary: "Escuta eventos do usuário autenticado.",
        },
        webhook: {
          step: "03",
          title: "Confirmar webhook",
          summary: "Envia o callback assinado de pagamento.",
        },
      },
      scenarios: {
        "account-create": "Criar conta",
        "account-replay": "Replay",
        "account-conflict-prime": "Preparar chave",
        "account-conflict-replay": "Replay conflitante",
        "account-missing-key": "Sem chave",
        "account-invalid-payload": "Payload inválido",
        "account-unsupported-currency": "Moeda não suportada",
        "events-probe": "Testar sem autenticação",
        "events-connect": "Conectar",
        "webhook-confirmed": "Confirmado",
        "webhook-unsupported": "Status inválido",
        "webhook-invalid-signature": "Assinatura inválida",
        "webhook-expired-signature": "Assinatura expirada",
        "custom-request": "Enviar requisição",
      },
      advancedTitle: "Ferramentas avançadas",
      advancedSummary:
        "Health interno, requisição customizada, alertas e controles extras.",
      healthTitle: "Health",
      healthSummary: "Use a verificação completa ou execute sondas isoladas.",
      healthServices: {
        gateway: "Gateway",
        webhook: "Webhook",
        payment: "Payments",
        onboarding: "Onboarding",
        identity: "Identity",
        membership: "Membership",
      },
      healthStatus: {
        idle: "Não verificado",
        checking: "Verificando",
        up: "Saudável",
        degraded: "Parcial",
        down: "Indisponível",
      },
      customTitle: "Requisição customizada",
      customSummary: "Use qualquer método, rota ou corpo fora do fluxo principal.",
      routeVisibility: {
        public: "público",
        "public-protected": "protegido",
        "internal-proxy": "interno",
        utility: "ferramenta",
      },
    };
  }

  return {
    pageTitle: "Modularis Flow Demo",
    brand: "Modularis Sandbox",
    topbarEyebrow: "fast microservice demo",
    localeCurrent: "EN",
    localeAlternate: "PT-BR",
    localeHref: manualApiSpec.publicDocsRoutes.ptBR,
    heroEyebrow: "sandbox / demo",
    heroSummary:
      "Create an account, open the stream, and confirm a webhook in a few clicks.",
    heroActions: {
      create: "Create account",
      stream: "Open stream",
      webhook: "Confirm webhook",
    },
    heroChips: ["local stack", "real services"],
    contextLabel: "Quick context",
    context: {
      base: "Base",
      auth: "Auth",
      stream: "Stream",
      alerts: "Alerts",
    },
    sessionTitle: "Session",
    sessionSummary: "Base, auth, and quick state.",
    labels: {
      baseUrl: "Base URL",
      cookies: "Use browser cookies",
      globalHeaders: "Global headers",
      auth: "Auth",
      bearerToken: "Bearer token",
      userId: "User id",
      jwtSecret: "JWT secret",
      alerts: "Alerts",
      state: "State",
      lastUserId: "Last user id",
      lastPaymentReference: "Last payment reference",
      lastEvent: "Last event",
      idempotencyKey: "Idempotency-Key",
      payload: "JSON payload",
      path: "Path",
      query: "Query",
      extraHeaders: "Headers",
      requestOptions: "Request options",
      signatureOptions: "Signature",
      signatureHeader: "Signature header",
      timestamp: "Timestamp",
      sharedSecret: "Shared secret",
      computedSignature: "Signature",
      method: "Method",
      pathOrUrl: "Path or URL",
      body: "Body",
      liveLog: "Live log",
      streamState: "Stream state",
      eventCount: "Events",
      latestEvent: "Latest",
    },
    buttons: {
      authDetails: "Auth",
      alertsDetails: "Alerts",
      stateDetails: "State",
      enableAlerts: "Enable alerts",
      clearAlert: "Clear",
      copyState: "Copy state",
      clearState: "Clear state",
      generateJwt: "Generate JWT",
      useLatestUserId: "Latest user id",
      clearToken: "Clear token",
      generateKey: "Generate key",
      loadLatestPayment: "Use latest payment",
      refreshTimestamp: "Refresh time",
      generateSignature: "Generate signature",
      disconnect: "Close stream",
      clearLog: "Clear log",
      sendRequest: "Send",
      clearBody: "Clear body",
      advanced: "Advanced tools",
      healthSweep: "Check services",
      healthRun: "Run",
    },
    placeholders: {
      bearerToken: "Paste a JWT here",
      jwtUserId: "user uuid",
      query: "foo=bar",
      queryCustom: "foo=bar&limit=1",
      optionalBody: "Optional body",
    },
    notification: {
      default: "Enable notifications if you want native alerts.",
      empty: "No alerts yet.",
      note: "If the browser blocks them, the page still shows the message.",
    },
    stateEmpty: "not set",
    streamEmpty: "No stream activity yet.",
    resultEmpty: "No test has been run yet.",
    drawerTitle: "Latest result",
    drawerLabels: {
      title: "Detail",
      request: "Request",
      response: "Response",
      requestHeaders: "Headers",
      requestBody: "Body",
      responseHeaders: "Headers",
      responseBody: "Body",
      liveLog: "Stream log",
      url: "URL",
    },
    drawerButtons: {
      close: "Close",
      copyBody: "Copy body",
      copyFull: "Copy full result",
      clear: "Clear",
    },
    flowStackLabel: "Main flows",
    mainFlows: {
      accounts: {
        step: "01",
        title: "Create account",
        summary: "Triggers onboarding and creates the payment intent.",
      },
      events: {
        step: "02",
        title: "Open stream",
        summary: "Listens to authenticated user events.",
      },
      webhook: {
        step: "03",
        title: "Confirm webhook",
        summary: "Posts the signed payment callback.",
      },
    },
    scenarios: {
      "account-create": "Create account",
      "account-replay": "Replay",
      "account-conflict-prime": "Prime key",
      "account-conflict-replay": "Conflict replay",
      "account-missing-key": "Missing key",
      "account-invalid-payload": "Invalid payload",
      "account-unsupported-currency": "Unsupported currency",
      "events-probe": "Probe without auth",
      "events-connect": "Connect",
      "webhook-confirmed": "Confirmed",
      "webhook-unsupported": "Unsupported status",
      "webhook-invalid-signature": "Invalid signature",
      "webhook-expired-signature": "Expired signature",
      "custom-request": "Send request",
    },
    advancedTitle: "Advanced tools",
    advancedSummary:
      "Internal health, custom request, notifications, and extra controls.",
    healthTitle: "Health",
    healthSummary: "Use sweep for the full stack or run individual probes.",
    healthServices: {
      gateway: "Gateway",
      webhook: "Webhook",
      payment: "Payments",
      onboarding: "Onboarding",
      identity: "Identity",
      membership: "Membership",
    },
    healthStatus: {
      idle: "Not checked",
      checking: "Checking",
      up: "Healthy",
      degraded: "Partial",
      down: "Unavailable",
    },
    customTitle: "Custom request",
    customSummary: "Use any method, path, or body outside the main flow.",
    routeVisibility: {
      public: "public",
      "public-protected": "auth",
      "internal-proxy": "internal",
      utility: "tool",
    },
  };
}

function buttonClassForTone(tone) {
  switch (tone) {
    case "danger":
      return "danger";
    case "warning":
      return "warn";
    case "secondary":
      return "secondary";
    default:
      return "";
  }
}

function scenarioLabel(uiText, scenario) {
  return (
    uiText.scenarios[scenario.id] ||
    uiText.scenarios[scenario.action] ||
    scenario.label
  );
}

function healthRouteServiceId(routeId) {
  const [serviceId] = routeId.split("-");
  return serviceId;
}

function healthRouteTitle(route, uiText) {
  const serviceId = healthRouteServiceId(route.id);
  const baseTitle = uiText.healthServices[serviceId] || serviceId;
  const suffix = route.id.endsWith("-ready") ? "ready" : "live";
  return `${baseTitle} ${suffix}`;
}

function routeSummary(route, uiText) {
  return uiText.mainFlows[route.id]?.summary || route.description || "";
}

function renderTopbar(uiText) {
  return `
    <div class="topbar">
      <div class="topbar__brand">
        <span class="topbar__eyebrow">${escapeHtml(uiText.topbarEyebrow)}</span>
        <strong>${escapeHtml(uiText.brand)}</strong>
      </div>
      <a class="topbar__locale" href="${escapeHtml(uiText.localeHref)}">
        <span class="chip chip--soft">${escapeHtml(uiText.localeCurrent)}</span>
        <span>${escapeHtml(uiText.localeAlternate)}</span>
      </a>
    </div>
  `;
}

function renderHero(copy, uiText) {
  return `
    <header class="hero">
      ${renderTopbar(uiText)}
      <div class="hero__copy">
        <span class="hero__eyebrow">${escapeHtml(uiText.heroEyebrow)}</span>
        <h1>${escapeHtml(uiText.pageTitle)}</h1>
        <p class="hero__summary">${escapeHtml(uiText.heroSummary)}</p>
        <div class="hero__actions">
          <button class="button" type="button" data-playbook-action="playbook-account-create">${escapeHtml(uiText.heroActions.create)}</button>
          <button class="button secondary" type="button" data-playbook-action="playbook-arm-stream">${escapeHtml(uiText.heroActions.stream)}</button>
          <button class="button secondary" type="button" data-playbook-action="playbook-confirmed-webhook">${escapeHtml(uiText.heroActions.webhook)}</button>
        </div>
        <div class="hero__chips">
          ${uiText.heroChips.map((chip) => `<span class="chip">${escapeHtml(chip)}</span>`).join("")}
          <span class="chip chip--soft">${escapeHtml(copy.publicRoute)}</span>
        </div>
      </div>
    </header>
  `;
}

function renderContextBar(uiText) {
  return `
    <section class="context-bar" aria-label="${escapeHtml(uiText.contextLabel)}">
      <article class="context-pill">
        <span class="context-pill__label">${escapeHtml(uiText.context.base)}</span>
        <strong id="context-base-url">${escapeHtml(manualApiSpec.defaultBaseUrl)}</strong>
      </article>
      <article class="context-pill">
        <span class="context-pill__label">${escapeHtml(uiText.context.auth)}</span>
        <strong id="context-auth">${escapeHtml(uiText.stateEmpty)}</strong>
      </article>
      <article class="context-pill">
        <span class="context-pill__label">${escapeHtml(uiText.context.stream)}</span>
        <strong id="context-stream">${escapeHtml(uiText.stateEmpty)}</strong>
      </article>
      <article class="context-pill">
        <span class="context-pill__label">${escapeHtml(uiText.context.alerts)}</span>
        <strong id="context-notifications">${escapeHtml(uiText.stateEmpty)}</strong>
      </article>
      <span class="visually-hidden" id="context-credentials">${escapeHtml(uiText.stateEmpty)}</span>
    </section>
  `;
}

function renderSession(copy, uiText) {
  return `
    <section class="session-shell">
      <div class="session-shell__head">
        <div>
          <h2>${escapeHtml(uiText.sessionTitle)}</h2>
          <p>${escapeHtml(uiText.sessionSummary)}</p>
        </div>
      </div>

      <div class="session-shell__base">
        <label class="field">
          <span>${escapeHtml(uiText.labels.baseUrl)}</span>
          <input id="base-url" type="text" value="${escapeHtml(manualApiSpec.defaultBaseUrl)}" />
        </label>
        <label class="toggle" for="include-credentials">
          <input id="include-credentials" type="checkbox" checked />
          <span>${escapeHtml(uiText.labels.cookies)}</span>
        </label>
      </div>

      <div class="session-shell__details">
        <details class="mini-section">
          <summary>${escapeHtml(uiText.buttons.authDetails)}</summary>
          <div class="mini-section__body">
            <label class="field">
              <span>${escapeHtml(uiText.labels.bearerToken)}</span>
              <textarea id="bearer-token" class="compact-textarea" spellcheck="false" placeholder="${escapeHtml(uiText.placeholders.bearerToken)}"></textarea>
            </label>
            <div class="field-grid field-grid--two">
              <label class="field">
                <span>${escapeHtml(uiText.labels.userId)}</span>
                <input id="jwt-user-id" type="text" placeholder="${escapeHtml(uiText.placeholders.jwtUserId)}" />
              </label>
              <label class="field">
                <span>${escapeHtml(uiText.labels.jwtSecret)}</span>
                <input id="jwt-secret" type="text" value="change-this-for-production-at-least-32-characters" />
              </label>
            </div>
            <details class="inline-details">
              <summary>${escapeHtml(uiText.labels.globalHeaders)}</summary>
              <textarea id="global-headers" class="compact-textarea" spellcheck="false">${escapeHtml(prettyJson(defaultValues.globalHeaders))}</textarea>
            </details>
            <div class="button-row">
              <button class="button secondary" id="generate-jwt" type="button">${escapeHtml(uiText.buttons.generateJwt)}</button>
              <button class="button ghost" id="use-latest-user-id" type="button">${escapeHtml(uiText.buttons.useLatestUserId)}</button>
              <button class="button ghost" id="clear-token" type="button">${escapeHtml(uiText.buttons.clearToken)}</button>
            </div>
          </div>
        </details>

        <details class="mini-section">
          <summary>${escapeHtml(uiText.buttons.alertsDetails)}</summary>
          <div class="mini-section__body">
            <div class="mini-inline">
              <span class="status-pill neutral" id="notification-status-pill">${escapeHtml(uiText.stateEmpty)}</span>
              <span id="notification-status-text">${escapeHtml(uiText.notification.default)}</span>
            </div>
            <div class="code code--inline" id="notification-last-message">${escapeHtml(uiText.notification.empty)}</div>
            <div class="button-row">
              <button class="button secondary" id="request-notification-permission" type="button">${escapeHtml(uiText.buttons.enableAlerts)}</button>
              <button class="button ghost" id="clear-notification-banner" type="button">${escapeHtml(uiText.buttons.clearAlert)}</button>
            </div>
            <div class="alert-banner info" id="notification-fallback-banner">${escapeHtml(uiText.notification.note)}</div>
          </div>
        </details>

        <details class="mini-section">
          <summary>${escapeHtml(uiText.buttons.stateDetails)}</summary>
          <div class="mini-section__body">
            <div class="state-list">
              <div class="state-row">
                <span>${escapeHtml(uiText.labels.lastUserId)}</span>
                <strong id="state-user-id">${escapeHtml(uiText.stateEmpty)}</strong>
              </div>
              <div class="state-row">
                <span>${escapeHtml(uiText.labels.lastPaymentReference)}</span>
                <strong id="state-payment-reference">${escapeHtml(uiText.stateEmpty)}</strong>
              </div>
              <div class="state-row">
                <span>${escapeHtml(uiText.labels.lastEvent)}</span>
                <strong id="state-last-event">${escapeHtml(uiText.stateEmpty)}</strong>
              </div>
              <div class="state-hidden">
                <span id="state-payment-id">${escapeHtml(uiText.stateEmpty)}</span>
                <span id="state-idempotency-key">${escapeHtml(uiText.stateEmpty)}</span>
                <span id="state-correlation-id">${escapeHtml(uiText.stateEmpty)}</span>
              </div>
            </div>
            <div class="button-row">
              <button class="button secondary" id="copy-state" type="button">${escapeHtml(uiText.buttons.copyState)}</button>
              <button class="button ghost" id="clear-state" type="button">${escapeHtml(uiText.buttons.clearState)}</button>
            </div>
          </div>
        </details>
      </div>
    </section>
  `;
}

function renderScenarioButtons(uiText, route) {
  return `
    <div class="scenario-row" aria-label="Scenarios">
      ${route.scenarios
        .map(
          (scenario) => `
            <button
              class="scenario-button ${buttonClassForTone(scenario.tone)}"
              type="button"
              data-scenario-id="${escapeHtml(scenario.id)}"
              data-scenario-action="${escapeHtml(scenario.action)}"
              data-route-id="${escapeHtml(route.id)}"
            >
              ${escapeHtml(scenarioLabel(uiText, scenario))}
            </button>
          `,
        )
        .join("")}
    </div>
  `;
}

function renderResultShell(route, title, uiText) {
  return `
    <div
      class="route-status"
      id="${escapeHtml(routeFieldId(route.id, "result"))}"
      data-result-empty-label="${escapeHtml(uiText.resultEmpty)}"
      data-result-title="${escapeHtml(title)}"
    >
      <span class="route-status__empty">${escapeHtml(uiText.resultEmpty)}</span>
    </div>
  `;
}

function renderRequestOptions(copy, route, uiText, includeMethod = false) {
  const queryPlaceholder =
    route.formType === "custom" ? uiText.placeholders.queryCustom : uiText.placeholders.query;

  return `
    <details class="inline-details">
      <summary>${escapeHtml(uiText.labels.requestOptions)}</summary>
      <div class="field-grid ${includeMethod ? "field-grid--three" : "field-grid--two"}">
        ${
          includeMethod
            ? `
              <label class="field">
                <span>${escapeHtml(uiText.labels.method)}</span>
                <select id="${escapeHtml(routeFieldId(route.id, "method"))}">
                  <option>GET</option>
                  <option>POST</option>
                  <option>PUT</option>
                  <option>PATCH</option>
                  <option>DELETE</option>
                </select>
              </label>
            `
            : ""
        }
        <label class="field">
          <span>${escapeHtml(includeMethod ? uiText.labels.pathOrUrl : uiText.labels.path)}</span>
          <input id="${escapeHtml(routeFieldId(route.id, "path"))}" type="text" value="${escapeHtml(route.path)}" />
        </label>
        <label class="field">
          <span>${escapeHtml(uiText.labels.query)}</span>
          <input id="${escapeHtml(routeFieldId(route.id, "query"))}" type="text" placeholder="${escapeHtml(queryPlaceholder)}" />
        </label>
      </div>
      <label class="field">
        <span>${escapeHtml(uiText.labels.extraHeaders)}</span>
        <textarea id="${escapeHtml(routeFieldId(route.id, "headers"))}" class="compact-textarea" spellcheck="false">${escapeHtml(prettyJson(defaultValues.requestHeaders))}</textarea>
      </label>
    </details>
  `;
}

function renderMainFlowCard(copy, route, uiText) {
  const flowMeta = uiText.mainFlows[route.id];
  const title = flowMeta.title;

  let body = "";

  if (route.formType === "account") {
    body = `
      <div class="field-grid field-grid--two">
        <label class="field">
          <span>${escapeHtml(uiText.labels.idempotencyKey)}</span>
          <input id="${escapeHtml(routeFieldId(route.id, "idempotencyKey"))}" type="text" />
        </label>
        <div class="helper-box">
          <button class="button ghost" type="button" data-helper-action="generate-account-key" data-route-id="${escapeHtml(route.id)}">${escapeHtml(uiText.buttons.generateKey)}</button>
        </div>
      </div>
      <label class="field">
        <span>${escapeHtml(uiText.labels.payload)}</span>
        <textarea id="${escapeHtml(routeFieldId(route.id, "payload"))}" spellcheck="false">${escapeHtml(prettyJson(defaultValues.accountPayload))}</textarea>
      </label>
      ${renderRequestOptions(copy, route, uiText)}
      ${renderScenarioButtons(uiText, route)}
      ${renderResultShell(route, title, uiText)}
    `;
  } else if (route.formType === "events") {
    body = `
      <div class="stream-strip">
        <div class="stream-strip__item">
          <span>${escapeHtml(uiText.labels.streamState)}</span>
          <strong id="stream-inline-state">${escapeHtml(uiText.stateEmpty)}</strong>
        </div>
        <div class="stream-strip__item">
          <span>${escapeHtml(uiText.labels.eventCount)}</span>
          <strong id="stream-inline-count">0</strong>
        </div>
        <div class="stream-strip__item">
          <span>${escapeHtml(uiText.labels.latestEvent)}</span>
          <strong id="stream-inline-last">${escapeHtml(uiText.stateEmpty)}</strong>
        </div>
      </div>
      <label class="field">
        <span>${escapeHtml(uiText.labels.liveLog)}</span>
        <pre class="stream-log" id="${escapeHtml(routeFieldId(route.id, "log"))}">${escapeHtml(uiText.streamEmpty)}</pre>
      </label>
      ${renderRequestOptions(copy, route, uiText)}
      <div class="button-row">
        <button class="button secondary" type="button" data-helper-action="disconnect-events" data-route-id="${escapeHtml(route.id)}">${escapeHtml(uiText.buttons.disconnect)}</button>
        <button class="button ghost" type="button" data-helper-action="clear-events-log" data-route-id="${escapeHtml(route.id)}">${escapeHtml(uiText.buttons.clearLog)}</button>
      </div>
      ${renderScenarioButtons(uiText, route)}
      ${renderResultShell(route, title, uiText)}
    `;
  } else if (route.formType === "webhook") {
    body = `
      <div class="button-row">
        <button class="button ghost" type="button" data-helper-action="load-latest-payment" data-route-id="${escapeHtml(route.id)}">${escapeHtml(uiText.buttons.loadLatestPayment)}</button>
      </div>
      <label class="field">
        <span>${escapeHtml(uiText.labels.payload)}</span>
        <textarea id="${escapeHtml(routeFieldId(route.id, "payload"))}" spellcheck="false">${escapeHtml(prettyJson(defaultValues.webhookPayload))}</textarea>
      </label>
      <details class="inline-details">
        <summary>${escapeHtml(uiText.labels.signatureOptions)}</summary>
        <div class="field-grid field-grid--three">
          <label class="field">
            <span>${escapeHtml(uiText.labels.path)}</span>
            <input id="${escapeHtml(routeFieldId(route.id, "path"))}" type="text" value="${escapeHtml(route.path)}" />
          </label>
          <label class="field">
            <span>${escapeHtml(uiText.labels.signatureHeader)}</span>
            <input id="${escapeHtml(routeFieldId(route.id, "headerName"))}" type="text" value="x-payment-signature" />
          </label>
          <label class="field">
            <span>${escapeHtml(uiText.labels.timestamp)}</span>
            <input id="${escapeHtml(routeFieldId(route.id, "timestamp"))}" type="number" />
          </label>
        </div>
        <div class="field-grid field-grid--two">
          <label class="field">
            <span>${escapeHtml(uiText.labels.sharedSecret)}</span>
            <input id="${escapeHtml(routeFieldId(route.id, "secret"))}" type="text" value="change-this-webhook-secret-at-least-32-characters" />
          </label>
          <label class="field">
            <span>${escapeHtml(uiText.labels.computedSignature)}</span>
            <input id="${escapeHtml(routeFieldId(route.id, "signature"))}" type="text" />
          </label>
        </div>
        <div class="button-row">
          <button class="button secondary" type="button" data-helper-action="refresh-webhook-timestamp" data-route-id="${escapeHtml(route.id)}">${escapeHtml(uiText.buttons.refreshTimestamp)}</button>
          <button class="button ghost" type="button" data-helper-action="generate-webhook-signature" data-route-id="${escapeHtml(route.id)}">${escapeHtml(uiText.buttons.generateSignature)}</button>
        </div>
      </details>
      ${renderScenarioButtons(uiText, route)}
      ${renderResultShell(route, title, uiText)}
    `;
  }

  return `
    <article
      class="flow-card"
      id="${escapeHtml(`route-${route.id}`)}"
      data-route-id="${escapeHtml(route.id)}"
      data-route-domain="${escapeHtml(route.domain)}"
      data-route-form-type="${escapeHtml(route.formType)}"
      data-route-visibility="${escapeHtml(route.visibility)}"
    >
      <div class="flow-card__head">
        <span class="flow-step">${escapeHtml(flowMeta.step)}</span>
        <div class="flow-card__title">
          <h2>${escapeHtml(title)}</h2>
          <p>${escapeHtml(routeSummary(route, uiText))}</p>
        </div>
      </div>
      <div class="code">${escapeHtml(route.method)} ${escapeHtml(route.path)}</div>
      ${body}
    </article>
  `;
}

function renderHealthOverview(uiText) {
  return `
    <section class="advanced-block">
      <div class="advanced-block__head">
        <div>
          <h3>${escapeHtml(uiText.healthTitle)}</h3>
          <p>${escapeHtml(uiText.healthSummary)}</p>
        </div>
        <div class="button-row">
          <button class="button secondary" id="stack-sweep" type="button">${escapeHtml(uiText.buttons.healthSweep)}</button>
          <span class="advanced-meta" id="stack-sweep-timestamp">${escapeHtml(uiText.healthStatus.idle)}</span>
        </div>
      </div>
      <div class="health-grid">
        ${Object.entries(uiText.healthServices)
          .map(
            ([serviceId, label]) => `
              <article class="health-tile" data-health-service="${escapeHtml(serviceId)}">
                <div class="health-tile__top">
                  <h4>${escapeHtml(label)}</h4>
                  <span class="status-pill neutral" id="health-${escapeHtml(serviceId)}-status">${escapeHtml(uiText.healthStatus.idle)}</span>
                </div>
                <p id="health-${escapeHtml(serviceId)}-detail">${escapeHtml(uiText.healthStatus.idle)}</p>
              </article>
            `,
          )
          .join("")}
      </div>
    </section>
  `;
}

function renderHealthRouteCard(route, uiText) {
  const title = healthRouteTitle(route, uiText);

  return `
    <article
      class="probe-card"
      id="${escapeHtml(`route-${route.id}`)}"
      data-route-id="${escapeHtml(route.id)}"
      data-route-domain="${escapeHtml(route.domain)}"
      data-route-form-type="${escapeHtml(route.formType)}"
      data-route-visibility="${escapeHtml(route.visibility)}"
    >
      <div class="probe-card__head">
        <div>
          <h4>${escapeHtml(title)}</h4>
          <span class="chip chip--soft">${escapeHtml(uiText.routeVisibility[route.visibility])}</span>
        </div>
        <button
          class="button ghost"
          type="button"
          data-scenario-id="${escapeHtml(route.scenarios[0].id)}"
          data-scenario-action="${escapeHtml(route.scenarios[0].action)}"
          data-route-id="${escapeHtml(route.id)}"
        >
          ${escapeHtml(uiText.buttons.healthRun)}
        </button>
      </div>
      <label class="field">
        <span>${escapeHtml(uiText.labels.path)}</span>
        <input id="${escapeHtml(routeFieldId(route.id, "path"))}" type="text" value="${escapeHtml(route.path)}" />
      </label>
      <details class="inline-details">
        <summary>${escapeHtml(uiText.labels.requestOptions)}</summary>
        <div class="field-grid field-grid--two">
          <label class="field">
            <span>${escapeHtml(uiText.labels.query)}</span>
            <input id="${escapeHtml(routeFieldId(route.id, "query"))}" type="text" placeholder="check=1" />
          </label>
          <label class="field">
            <span>${escapeHtml(uiText.labels.extraHeaders)}</span>
            <textarea id="${escapeHtml(routeFieldId(route.id, "headers"))}" class="compact-textarea" spellcheck="false">${escapeHtml(prettyJson(defaultValues.requestHeaders))}</textarea>
          </label>
        </div>
      </details>
      ${renderResultShell(route, title, uiText)}
    </article>
  `;
}

function renderCustomCard(route, copy, uiText) {
  const title = uiText.customTitle;

  return `
    <article
      class="probe-card probe-card--custom"
      id="${escapeHtml(`route-${route.id}`)}"
      data-route-id="${escapeHtml(route.id)}"
      data-route-domain="${escapeHtml(route.domain)}"
      data-route-form-type="${escapeHtml(route.formType)}"
      data-route-visibility="${escapeHtml(route.visibility)}"
    >
      <div class="probe-card__head">
        <div>
          <h4>${escapeHtml(title)}</h4>
          <p>${escapeHtml(uiText.customSummary)}</p>
        </div>
      </div>
      <div class="field-grid field-grid--three">
        <label class="field">
          <span>${escapeHtml(uiText.labels.method)}</span>
          <select id="${escapeHtml(routeFieldId(route.id, "method"))}">
            <option>GET</option>
            <option>POST</option>
            <option>PUT</option>
            <option>PATCH</option>
            <option>DELETE</option>
          </select>
        </label>
        <label class="field">
          <span>${escapeHtml(uiText.labels.pathOrUrl)}</span>
          <input id="${escapeHtml(routeFieldId(route.id, "path"))}" type="text" value="${escapeHtml(route.path)}" />
        </label>
        <label class="field">
          <span>${escapeHtml(uiText.labels.query)}</span>
          <input id="${escapeHtml(routeFieldId(route.id, "query"))}" type="text" placeholder="${escapeHtml(uiText.placeholders.queryCustom)}" />
        </label>
      </div>
      <label class="field">
        <span>${escapeHtml(uiText.labels.extraHeaders)}</span>
        <textarea id="${escapeHtml(routeFieldId(route.id, "headers"))}" class="compact-textarea" spellcheck="false">${escapeHtml(prettyJson(defaultValues.customHeaders))}</textarea>
      </label>
      <label class="field">
        <span>${escapeHtml(uiText.labels.body)}</span>
        <textarea id="${escapeHtml(routeFieldId(route.id, "body"))}" class="compact-textarea" spellcheck="false" placeholder="${escapeHtml(uiText.placeholders.optionalBody)}"></textarea>
      </label>
      <div class="button-row">
        <button class="button secondary" type="button" data-scenario-id="custom-request" data-scenario-action="custom-request" data-route-id="${escapeHtml(route.id)}">${escapeHtml(uiText.buttons.sendRequest)}</button>
        <button class="button ghost" type="button" data-helper-action="clear-custom-body" data-route-id="${escapeHtml(route.id)}">${escapeHtml(uiText.buttons.clearBody)}</button>
      </div>
      ${renderResultShell(route, title, uiText)}
    </article>
  `;
}

function renderAdvancedTools(copy, uiText) {
  const routes = Object.values(copy.routes);
  const healthRoutes = routes.filter((route) => route.formType === "health");
  const customRoute = routes.find((route) => route.formType === "custom");

  return `
    <details class="advanced-shell" id="advanced-tools">
      <summary>
        <span>${escapeHtml(uiText.advancedTitle)}</span>
        <small>${escapeHtml(uiText.advancedSummary)}</small>
      </summary>
      <div class="advanced-shell__body">
        ${renderHealthOverview(uiText)}
        <section class="advanced-block">
          <div class="advanced-block__head">
            <div>
              <h3>${escapeHtml(uiText.healthTitle)}</h3>
              <p>${escapeHtml(uiText.healthSummary)}</p>
            </div>
          </div>
          <div class="probe-grid">
            ${healthRoutes.map((route) => renderHealthRouteCard(route, uiText)).join("")}
          </div>
        </section>
        ${
          customRoute
            ? `
              <section class="advanced-block">
                ${renderCustomCard(customRoute, copy, uiText)}
              </section>
            `
            : ""
        }
      </div>
    </details>
  `;
}

function renderResultDrawer(uiText) {
  return `
    <div class="drawer-backdrop" id="result-drawer-backdrop" hidden></div>
    <aside
      class="result-drawer"
      id="result-drawer"
      hidden
      aria-hidden="true"
      aria-labelledby="result-drawer-title"
    >
      <div class="result-drawer__panel">
        <div class="result-drawer__header">
          <div>
            <span class="drawer-eyebrow">${escapeHtml(uiText.drawerTitle)}</span>
            <h2 id="result-drawer-title">${escapeHtml(uiText.drawerLabels.title)}</h2>
          </div>
          <div class="result-drawer__meta">
            <span class="status-pill neutral" id="result-drawer-status">${escapeHtml(uiText.resultEmpty)}</span>
            <span class="chip" id="result-drawer-duration">0 ms</span>
          </div>
        </div>
        <div class="result-drawer__toolbar">
          <button class="button secondary" type="button" data-result-action="copy-body" data-result-id="">${escapeHtml(uiText.drawerButtons.copyBody)}</button>
          <button class="button secondary" type="button" data-result-action="copy-full" data-result-id="">${escapeHtml(uiText.drawerButtons.copyFull)}</button>
          <button class="button ghost" type="button" data-result-action="clear" data-result-id="">${escapeHtml(uiText.drawerButtons.clear)}</button>
          <button class="button ghost" id="result-drawer-close" type="button">${escapeHtml(uiText.drawerButtons.close)}</button>
        </div>
        <div class="result-drawer__body">
          <section class="drawer-block drawer-block--full">
            <h3>${escapeHtml(uiText.drawerLabels.url)}</h3>
            <pre id="result-drawer-url">${escapeHtml(uiText.resultEmpty)}</pre>
          </section>
          <section class="drawer-grid">
            <article class="drawer-block">
              <h3>${escapeHtml(uiText.drawerLabels.requestHeaders)}</h3>
              <pre id="result-drawer-request-headers">${escapeHtml(uiText.resultEmpty)}</pre>
            </article>
            <article class="drawer-block">
              <h3>${escapeHtml(uiText.drawerLabels.requestBody)}</h3>
              <pre id="result-drawer-request-body">${escapeHtml(uiText.resultEmpty)}</pre>
            </article>
            <article class="drawer-block">
              <h3>${escapeHtml(uiText.drawerLabels.responseHeaders)}</h3>
              <pre id="result-drawer-response-headers">${escapeHtml(uiText.resultEmpty)}</pre>
            </article>
            <article class="drawer-block">
              <h3>${escapeHtml(uiText.drawerLabels.responseBody)}</h3>
              <pre id="result-drawer-response-body">${escapeHtml(uiText.resultEmpty)}</pre>
            </article>
          </section>
          <section class="drawer-block drawer-block--full" id="result-drawer-live-log-shell" hidden>
            <h3>${escapeHtml(uiText.drawerLabels.liveLog)}</h3>
            <pre id="result-drawer-live-log">${escapeHtml(uiText.resultEmpty)}</pre>
          </section>
        </div>
      </div>
    </aside>
  `;
}

function renderPage(copy, styles, runtimeScript) {
  const experience = getRuntimeExperience(copy);
  const runtimeCopy = getRuntimeCopy(copy);
  const uiText = getInterfaceCopy(copy);
  const routes = copy.routes;

  return `<!DOCTYPE html>
<html lang="${escapeHtml(copy.localeCode)}">
  <head>
    <meta charset="UTF-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1.0" />
    <title>${escapeHtml(uiText.pageTitle)}</title>
    <style>
${styles}
    </style>
  </head>
  <body>
    <div class="page-shell">
      <main class="page">
        ${renderHero(copy, uiText)}
        ${renderContextBar(uiText)}
        ${renderSession(copy, uiText)}
        <section class="flow-stack" aria-label="${escapeHtml(uiText.flowStackLabel)}">
          ${renderMainFlowCard(copy, routes.accounts, uiText)}
          ${renderMainFlowCard(copy, routes.events, uiText)}
          ${renderMainFlowCard(copy, routes.webhook, uiText)}
        </section>
        ${renderAdvancedTools(copy, uiText)}
      </main>

      ${renderResultDrawer(uiText)}
      <div class="toast-stack" id="toast-stack" aria-live="polite" aria-atomic="true"></div>
    </div>

    <script id="manual-api-spec" type="application/json">${scriptJson(manualApiSpec)}</script>
    <script id="manual-api-copy" type="application/json">${scriptJson(runtimeCopy)}</script>
    <script id="manual-api-experience" type="application/json">${scriptJson(experience)}</script>
    <script>
      const manualApiSpec = JSON.parse(document.getElementById("manual-api-spec").textContent);
      const uiCopy = JSON.parse(document.getElementById("manual-api-copy").textContent);
      const uiExperience = JSON.parse(document.getElementById("manual-api-experience").textContent);
${runtimeScript}
    </script>
  </body>
</html>
`;
}

async function main() {
  const [styles, runtimeScript] = await Promise.all([
    readFile(stylesPath, "utf8"),
    readFile(runtimePath, "utf8"),
  ]);

  for (const copy of Object.values(locales)) {
    const html = renderPage(copy, styles, runtimeScript);
    await writeFile(resolve(docsDir, copy.fileName), html, "utf8");
  }
}

await main();
