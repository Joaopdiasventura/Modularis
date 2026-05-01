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
  const port = configService.getOrThrow<number>('port');

  app.useLogger(logger);
  app.useGlobalPipes(
    new ValidationPipe({
      whitelist: true,
      forbidNonWhitelisted: true,
      transform: true,
      transformOptions: { enableImplicitConversion: true },
    }),
  );
  app.useGlobalFilters(new ProblemDetailsFilter());

  await app.listen(port, '0.0.0.0');
}
void bootstrap();
