import { Module } from '@nestjs/common';
import { CoachesModule } from '../coaches/coaches.module';
import { NotificationsModule } from '../notifications/notifications.module';
import { EnrollmentsController } from './enrollments.controller';
import { EnrollmentsService } from './enrollments.service';

/**
 * Enrollments: the athlete↔coach↔program relationship.
 *
 * Imports `CoachesModule` for `CoachAccessService` rather than re-implementing
 * verification, capacity and ownership checks. The enrollment row is what those
 * checks are *about*, so the two modules must agree on them exactly.
 */
@Module({
  imports: [CoachesModule, NotificationsModule],
  controllers: [EnrollmentsController],
  providers: [EnrollmentsService],
  exports: [EnrollmentsService],
})
export class EnrollmentsModule {}
