import { Module } from '@nestjs/common';
import { MessagingController } from './messaging.controller';
import { MessagingService } from './messaging.service';
import { MessagingRepository } from './messaging.repository';
import { NotificationsModule } from '../notifications/notifications.module';

/**
 * Athlete↔coach messaging.
 *
 * `MessagingService` is exported so other modules can reach the two operations
 * that are not HTTP routes: `openConversation`, which get-or-creates the single
 * thread for a pair, and `postPlatformMessage`, which writes a `system` or
 * `ai_summary` message into it. That pair is what the AI assistant uses to
 * escalate a question to the coach or file a progress summary — the message
 * lands in the same transcript the two of them already read, and the platform
 * kinds stay unreachable from any client.
 */
@Module({
  imports: [NotificationsModule],
  controllers: [MessagingController],
  providers: [MessagingService, MessagingRepository],
  exports: [MessagingService],
})
export class MessagingModule {}
