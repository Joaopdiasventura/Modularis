import { readFileSync } from "node:fs";

function readJson(relativePath) {
  return JSON.parse(
    readFileSync(new URL(relativePath, import.meta.url), "utf8"),
  );
}

export const manualApiSpec = readJson("./manual-api-console.spec.json");

export const defaultValues = {
  accountPayload: {
    email: "manual.test@example.com",
    name: "Manual Test",
    cellphone: "5511999999999",
    taxId: "12345678900",
    amount: 49,
    currency: "BRL",
  },
  invalidPayload: {
    email: "not-an-email",
    name: "",
    cellphone: "5511666666666",
    taxId: "12345678933",
    amount: 0,
    currency: "br",
  },
  unsupportedCurrencyPayload: {
    email: "manual.currency@example.com",
    name: "Currency Check",
    cellphone: "5511555555555",
    taxId: "12345678944",
    amount: 49,
    currency: "BTC",
  },
  webhookPayload: {
    eventId: "11111111-1111-1111-1111-111111111111",
    paymentReference: "replace-from-latest-account",
    amount: 49,
    currency: "BRL",
    status: "CONFIRMED",
    occurredAt: "2026-04-26T18:00:00.000Z",
  },
  globalHeaders: {},
  requestHeaders: {},
  customHeaders: {
    Accept: "application/json",
  },
};

export const locales = {
  en: readJson("./manual-api-console.copy.en.json"),
  ptBR: readJson("./manual-api-console.copy.pt-BR.json"),
};
