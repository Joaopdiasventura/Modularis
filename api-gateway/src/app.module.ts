import {
  MiddlewareConsumer,
  Module,
  NestModule,
  RequestMethod,
} from '@nestjs/common';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { ThrottlerModule } from '@nestjs/throttler';
import { AppConfig, validateEnvironment } from './config/app.config';
import type { AppConfigType } from './config/types/app-config.type';
import { CoreModule } from './core/core.module';
import { JsonLogger } from './shared/logging/json-logger.service';
import { CorrelationIdMiddleware } from './shared/middleware/request-context.middleware';
import { AuthModule } from './shared/modules/auth/auth.module';
import { HealthModule } from './shared/modules/health/health.module';
import { MessagingModule } from './shared/modules/messaging/messaging.module';

@Module({
  imports: [
    ConfigModule.forRoot({
      isGlobal: true,
      load: [(): AppConfigType => AppConfig.load()],
      validate: validateEnvironment,
    }),
    ThrottlerModule.forRootAsync({
      inject: [ConfigService],
      useFactory: (
        configService: ConfigService,
      ): Array<{ ttl: number; limit: number }> => [
        {
          ttl: configService.getOrThrow('gateway.rateLimitTtlMs'),
          limit: configService.getOrThrow('gateway.rateLimitLimit'),
        },
      ],
    }),
    MessagingModule,
    AuthModule,
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
