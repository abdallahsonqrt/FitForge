import { Module } from '@nestjs/common';
import { ExerciseMediaModule } from '../exercise-media/exercise-media.module';
import { MessagingModule } from '../messaging/messaging.module';
import { CoachesController } from './coaches.controller';
import { CoachesService } from './coaches.service';
import { CoachProgramsController } from './coach-programs.controller';
import { CoachProgramsService } from './coach-programs.service';
import { CoachAccessService } from './coach-access.service';
import { CoachClientsController } from './coach-clients.controller';
import { CoachClientsService } from './coach-clients.service';

/**
 * Coaches: the public directory, matching, and the coach's own program builder.
 *
 * `CoachProgramsController` is registered first so `/coaches/me/programs` is
 * matched before `CoachesController`'s `/coaches/:id` gets a chance to read
 * `me` as an id.
 *
 * `CoachAccessService` is exported because it owns the answer to "is this coach
 * allowed to see this athlete / this program". Enrollments needs it, and so does
 * anything else that ends up gating on the coach↔athlete relationship —
 * messaging, progress, form reviews. Exporting the check is what stops each of
 * them from growing its own slightly different copy.
 *
 * `ExerciseMediaModule` is imported for `ExerciseCardService`: the program
 * builder lists the exercises inside a session, and the coach must see the same
 * card — same poster frame, same muscle line — that the athlete will.
 *
 * `MessagingModule` is imported for the unread total on the dashboard. It has no
 * imports of its own, so the edge cannot close into a cycle.
 */
@Module({
  imports: [ExerciseMediaModule, MessagingModule],
  controllers: [CoachProgramsController, CoachClientsController, CoachesController],
  providers: [CoachesService, CoachProgramsService, CoachClientsService, CoachAccessService],
  exports: [CoachAccessService, CoachesService],
})
export class CoachesModule {}
