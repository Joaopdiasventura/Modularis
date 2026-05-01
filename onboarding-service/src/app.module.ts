import {
  MiddlewareConsumer,
  Module,
  NestModule,
  RequestMethod,
} from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { AppConfig, validateEnvironment } from './config/app.config';
import type { AppConfigType } from './config/types/app-config.type';
import { CoreModule } from './core/core.module';
import { JsonLogger } from './shared/logging/json-logger.service';
import { CorrelationIdMiddleware } from './shared/middleware/request-context.middleware';
import { HealthModule } from './shared/modules/health/health.module';

@Module({
  imports: [
    ConfigModule.forRoot({
      isGlobal: true,
      load: [(): AppConfigType => AppConfig.load()],
      validate: validateEnvironment,
    }),
    CoreModule,
    HealthModule,
  ],
  providers: [JsonLogger],
})
export class AppModule implements NestModule {
  public configure(consumer: MiddlewareConsumer): void {
    consumer
      .apply(CorrelationIdMiddleware)
      .forRoutes({ path: '*', method: RequestMethod.ALL });
  }
}
