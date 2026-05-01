import { Module } from '@nestjs/common';
import { AuthModule } from '../../shared/modules/auth/auth.module';
import { EventStreamController } from './event-stream.controller';
import { EventStreamService } from './event-stream.service';
import { UserEventStreamService } from './user-event-stream.service';

@Module({
  imports: [AuthModule],
  controllers: [EventStreamController],
  providers: [EventStreamService, UserEventStreamService],
  exports: [UserEventStreamService],
})
export class EventStreamModule {}
