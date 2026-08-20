import { Module } from '@nestjs/common';
import { StorageModule } from '../../storage';
import { ExerciseMediaController } from './exercise-media.controller';
import { ExerciseVideosController } from './exercise-videos.controller';
import { ExerciseImagesController } from './exercise-images.controller';
import { ExerciseVideosService } from './exercise-videos.service';
import { ExerciseImagesService } from './exercise-images.service';
import { ExerciseMediaRepository } from './exercise-media.repository';
import { ExerciseCardService } from './exercise-card.service';
import { ExerciseMediaMapper } from './exercise-media.mapper';
import { MediaUrlService } from './media-url.service';
import { MediaValidationService } from './media-validation.service';
import { VideoProcessingService } from './video-processing.service';

/**
 * Exercise media.
 *
 * The layering, top to bottom: controllers do HTTP and authorisation, services
 * hold the rules, the repository owns every query, and `StorageService` — the one
 * thing that knows what a bucket is — holds the bytes.
 *
 * `MediaUrlService` and `ExerciseMediaMapper` are exported so the exercise
 * library can embed a ready-to-play video in an exercise's detail response
 * without reimplementing the public-vs-signed URL rule. `ExerciseCardService` is
 * exported for the same reason one level up: the athlete's plan screen and the
 * coach's program builder both embed a list of exercises, and they must resolve
 * the same poster frame in the same number of queries.
 */
@Module({
  imports: [StorageModule],
  controllers: [ExerciseMediaController, ExerciseVideosController, ExerciseImagesController],
  providers: [
    ExerciseMediaRepository,
    ExerciseCardService,
    ExerciseMediaMapper,
    MediaUrlService,
    MediaValidationService,
    VideoProcessingService,
    ExerciseImagesService,
    ExerciseVideosService,
  ],
  exports: [
    ExerciseVideosService,
    ExerciseImagesService,
    ExerciseMediaMapper,
    MediaUrlService,
    ExerciseMediaRepository,
    ExerciseCardService,
  ],
})
export class ExerciseMediaModule {}
