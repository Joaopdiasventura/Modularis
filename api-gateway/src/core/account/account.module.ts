import { Module } from '@nestjs/common';
import { AuthModule } from '../../shared/modules/auth/auth.module';
import { MessagingModule } from '../../shared/modules/messaging/messaging.module';
import { AccountController } from './account.controller';
import { AccountService } from './account.service';

@Module({
  imports: [MessagingModule, AuthModule],
  controllers: [AccountController],
  providers: [AccountService],
})
export class AccountModule {}
