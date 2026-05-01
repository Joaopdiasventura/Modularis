import { Module } from '@nestjs/common';
import { DatabaseModule } from '../../shared/modules/database/database.module';
import { MessagingModule } from '../../shared/modules/messaging/messaging.module';
import { OnboardingCommandConsumer } from './onboarding-command.consumer';
import { OnboardingRepository } from './onboarding.repository';
import { OnboardingService } from './onboarding.service';

@Module({
  imports: [DatabaseModule, MessagingModule],
  providers: [
    OnboardingService,
    OnboardingCommandConsumer,
    OnboardingRepository,
  ],
  exports: [OnboardingService],
})
export class OnboardingModule {}
