import { Module } from '@nestjs/common';
import { DatabaseModule } from '../database/database.module';
import { RabbitHealthIndicator } from './rabbit.health';
import { MessagingModule } from '../messaging/messaging.module';
import { HealthController } from './health.controller';

@Module({
  imports: [DatabaseModule, MessagingModule],
  controllers: [HealthController],
  providers: [RabbitHealthIndicator],
})
export class HealthModule {}
