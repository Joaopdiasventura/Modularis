import { Module } from '@nestjs/common';
import { AccountModule } from './account/account.module';
import { EventStreamModule } from './event-stream/event-stream.module';

@Module({
  imports: [AccountModule, EventStreamModule],
})
export class CoreModule {}
