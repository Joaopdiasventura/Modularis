import { Module } from '@nestjs/common';
import { RabbitBusService } from './rabbit-bus.service';

@Module({
  providers: [RabbitBusService],
  exports: [RabbitBusService],
})
export class MessagingModule {}
