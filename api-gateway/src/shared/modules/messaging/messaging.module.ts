import { Module } from '@nestjs/common';
import { EventStreamModule } from '../../../core/event-stream/event-stream.module';
import { RabbitBusService } from './rabbit-bus.service';

@Module({
  imports: [EventStreamModule],
  providers: [RabbitBusService],
  exports: [RabbitBusService],
})
export class MessagingModule {}
