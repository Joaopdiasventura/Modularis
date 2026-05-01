import cookieParser from 'cookie-parser';
import { ValidationPipe } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { NestFactory } from '@nestjs/core';
import { AppModule } from './app.module';
import type { AppConfigType } from './config/types/app-config.type';
import { ProblemDetailsFilter } from './shared/filters/problem-details.filter';
import { JsonLogger } from './shared/logging/json-logger.service';

async function bootstrap(): Promise<void> {
  const app = await NestFactory.create(AppModule);
  const configService = app.get<ConfigService<AppConfigType>>(ConfigService);
  const logger = app.get<JsonLogger>(JsonLogger);
  const allowedOrigins = configService.getOrThrow<string[]>('allowedOrigins');
  const allowedOriginSet = new Set(allowedOrigins.map(normalizeOrigin));
  const port = configService.getOrThrow<number>('port');
  const corsOriginHandler = (
    origin: string | undefined,
    callback: (error: Error | null, allow?: boolean) => void,
  ): void => {
    if (isAllowedCorsOrigin(origin, allowedOriginSet)) {
      callback(null, true);
      return;
    }
    callback(new Error(`Origin ${origin} is not allowed by CORS`), false);
  };

  app.useLogger(logger);
  app.use(cookieParser());
  app.useGlobalPipes(
    new ValidationPipe({
      whitelist: true,
      forbidNonWhitelisted: true,
      transform: true,
      transformOptions: { enableImplicitConversion: true },
    }),
  );
  app.useGlobalFilters(new ProblemDetailsFilter());
  app.enableCors({
    origin: corsOriginHandler,
    methods: ['GET', 'POST', 'OPTIONS'],
    credentials: true,
    allowedHeaders: [
      'Content-Type',
      'Authorization',
      'Idempotency-Key',
      'X-Request-Id',
      'Last-Event-ID',
    ],
    exposedHeaders: ['X-Request-Id', 'Idempotency-Replayed'],
  });

  await app.listen(port, '0.0.0.0');
}
void bootstrap();

function isAllowedCorsOrigin(
  origin: string | undefined,
  allowedOrigins: ReadonlySet<string>,
): boolean {
  if (!origin) return true;
  if (origin === 'null') return true;

  const normalized = normalizeOrigin(origin);
  if (allowedOrigins.has(normalized)) return true;

  try {
    const parsed = new URL(origin);
    return isLoopbackHost(parsed.hostname);
  } catch {
    return false;
  }
}

function normalizeOrigin(origin: string): string {
  return origin.trim().replace(/\/+$/, '').toLowerCase();
}

function isLoopbackHost(hostname: string): boolean {
  const normalized = hostname.trim().toLowerCase();
  return (
    normalized === 'localhost' ||
    normalized === '127.0.0.1' ||
    normalized === '::1' ||
    normalized === '[::1]'
  );
}
