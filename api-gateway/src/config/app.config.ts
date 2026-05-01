import { randomUUID } from 'node:crypto';
import type { AppConfigType } from './types/app-config.type';

function read(name: string, fallback?: string): string {
  const value = process.env[name]?.trim();
  if (value) return value;
  if (fallback !== undefined) return fallback;
  throw new Error(`Missing required environment variable ${name}`);
}

function readNumber(name: string, fallback: number): number {
  const raw = process.env[name]?.trim();
  if (!raw) return fallback;
  const parsed = Number(raw);
  if (!Number.isFinite(parsed)) {
    throw new Error(`${name} must be numeric`);
  }
  return parsed;
}

function readBoolean(name: string, fallback: boolean): boolean {
  const raw = process.env[name]?.trim().toLowerCase();
  if (!raw) return fallback;
  if (raw === 'true') return true;
  if (raw === 'false') return false;
  throw new Error(`${name} must be true or false`);
}

function readArray(name: string, fallback: string[]): string[] {
  const raw = process.env[name]?.trim();
  if (!raw) return fallback;
  const items = raw
    .split(',')
    .map((item) => item.trim())
    .filter(Boolean);
  if (items.length === 0) {
    throw new Error(`${name} must contain at least one value`);
  }
  return items;
}

function readSameSite(
  name: string,
  fallback: 'strict' | 'lax' | 'none',
): 'strict' | 'lax' | 'none' {
  const raw = process.env[name]?.trim().toLowerCase();
  if (!raw) return fallback;
  if (raw === 'strict' || raw === 'lax' || raw === 'none') return raw;
  throw new Error(`${name} must be strict, lax or none`);
}

export class AppConfig {
  public static load(): AppConfigType {
    return {
      serviceName: read('MODULARIS_SERVICE_NAME', 'api-gateway'),
      port: readNumber('PORT', 3000),
      allowedOrigins: readArray('MODULARIS_ALLOWED_ORIGINS', [
        'http://localhost',
      ]),
      rabbitmq: {
        url: read('MODULARIS_RABBITMQ_URL', 'amqp://user:user@localhost:5672/'),
        commandExchange: read(
          'MODULARIS_COMMAND_EXCHANGE',
          'modularis.commands',
        ),
        eventExchange: read('MODULARIS_EVENT_EXCHANGE', 'modularis.events'),
        responseExchange: read(
          'MODULARIS_RESPONSE_EXCHANGE',
          'modularis.responses',
        ),
        rpcTimeoutMs: readNumber('MODULARIS_RPC_TIMEOUT_MS', 5000),
      },
      auth: {
        cookieName: read('MODULARIS_AUTH_COOKIE_NAME', 'modularis_auth'),
        cookieSecure: readBoolean('MODULARIS_AUTH_COOKIE_SECURE', false),
        cookieSameSite: readSameSite('MODULARIS_AUTH_COOKIE_SAMESITE', 'lax'),
        jwtSecret: read(
          'MODULARIS_JWT_SECRET',
          'change-this-for-production-at-least-32-characters',
        ),
        jwtExpiresIn: read('MODULARIS_JWT_EXPIRES_IN', '1h'),
      },
      gateway: {
        rateLimitTtlMs: readNumber(
          'MODULARIS_GATEWAY_RATE_LIMIT_TTL_MS',
          60000,
        ),
        rateLimitLimit: readNumber('MODULARIS_GATEWAY_RATE_LIMIT_LIMIT', 30),
      },
      runtimeInstanceId:
        process.env.MODULARIS_INSTANCE_ID?.trim() || randomUUID(),
    };
  }
}

export function validateEnvironment(
  input: Record<string, unknown>,
): AppConfigType {
  void input;
  return AppConfig.load();
}
