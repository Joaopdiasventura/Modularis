import { Module } from '@nestjs/common';
import { TerminusModule } from '@nestjs/terminus';
import { MessagingModule } from '../messaging/messaging.module';
import { HealthController } from './health.controller';
import { RabbitHealthIndicator } from './rabbit.health';

@Module({
  imports: [TerminusModule, MessagingModule],
  controllers: [HealthController],
  providers: [RabbitHealthIndicator],
})
export class HealthModule {}
