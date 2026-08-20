import { Module } from '@nestjs/common';
import { StorageModule } from '../../storage';
import { CoachesModule } from '../coaches/coaches.module';
import { ExerciseMediaModule } from '../exercise-media/exercise-media.module';
import { SubscriptionsModule } from '../subscriptions/subscriptions.module';
import { PlansController } from './plans.controller';
import { PlansService } from './plans.service';
import { ExercisesController } from './exercises.controller';
import { ExercisesService } from './exercises.service';
import { ExercisesRepository } from './exercises.repository';

/**
 * Training: workout plans and the exercise library.
 *
 * The library composes media it does not own — `ExerciseMediaModule` exports the
 * repository, mapper and URL service, so an exercise response can embed a
 * ready-to-play video without this module knowing what a bucket is.
 *
 * `CoachesModule` is imported for `CoachAccessService`: deciding whether a plan
 * is visible to the caller needs to know whether they are the coach who wrote
 * it, and that answer must be the same one the builder uses. The dependency
 * points this way only — nothing in the coach domain imports training.
 */
@Module({
  imports: [CoachesModule, ExerciseMediaModule, StorageModule, SubscriptionsModule],
  controllers: [PlansController, ExercisesController],
  providers: [PlansService, ExercisesService, ExercisesRepository],
  exports: [PlansService, ExercisesService, ExercisesRepository],
})
export class TrainingModule {}
