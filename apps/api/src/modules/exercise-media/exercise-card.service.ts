import { Injectable } from '@nestjs/common';
import type { Exercise, ExerciseImage, ExerciseMuscle, Muscle } from '../../database/schema';
import { ExerciseMediaRepository } from './exercise-media.repository';
import { MediaUrlService } from './media-url.service';

/** The relational row shape an exercise arrives in when embedded in a plan day. */
export type ExerciseCardRow = Exercise & { muscles: (ExerciseMuscle & { muscle: Muscle })[] };

/**
 * The exercise as a list row needs it: enough to render the card, without the
 * instructions and full media list the detail screen fetches.
 */
export interface ExerciseCard {
  id: string;
  slug: string;
  name: string;
  difficulty: string;
  primaryMuscles: { slug: string; name: string }[];
  thumbnailUrl: string | null;
  hasVideo: boolean;
}

/**
 * Builds exercise cards for anything that embeds a list of exercises — the
 * athlete's plan detail screen and the coach's program builder both.
 *
 * It lives here, next to the media it composes, because both callers need the
 * same two non-obvious behaviours and a second copy would drift from the first:
 *
 *   - media is fetched once for the whole batch, not per exercise. A four-day
 *     plan references the same lifts repeatedly, and the per-row alternative is
 *     dozens of round trips to render one screen;
 *   - the poster frame falls back from the primary video's own thumbnail to a
 *     standalone image, and `MediaUrlService` decides whether that resolves to a
 *     public CDN URL or a signed one.
 */
@Injectable()
export class ExerciseCardService {
  constructor(
    private readonly media: ExerciseMediaRepository,
    private readonly urls: MediaUrlService,
  ) {}

  /**
   * A lookup keyed by exercise id, so the caller can shape its own rows without
   * this service knowing what a plan day or a program looks like.
   */
  async cardsFor(rows: ExerciseCardRow[]): Promise<Map<string, ExerciseCard>> {
    const byId = new Map(rows.map((row) => [row.id, row]));
    const exerciseIds = [...byId.keys()];
    if (exerciseIds.length === 0) return new Map();

    const [videos, images] = await Promise.all([
      this.media.findVideosByExercises(exerciseIds),
      this.media.findImagesByExercises(exerciseIds),
    ]);

    const thumbnails = await this.resolveThumbnails(exerciseIds, videos, images);
    const withVideo = new Set(videos.map((video) => video.exerciseId));

    return new Map(
      [...byId.values()].map((row) => [
        row.id,
        {
          id: row.id,
          slug: row.slug,
          name: row.name,
          difficulty: row.difficulty,
          primaryMuscles: (row.muscles ?? [])
            .filter((link) => link.role === 'primary')
            .sort((a, b) => a.orderIndex - b.orderIndex)
            .map((link) => ({ slug: link.muscle.slug, name: link.muscle.name })),
          thumbnailUrl: thumbnails.get(row.id) ?? null,
          hasVideo: withVideo.has(row.id),
        },
      ]),
    );
  }

  private async resolveThumbnails(
    exerciseIds: string[],
    videos: Awaited<ReturnType<ExerciseMediaRepository['findVideosByExercises']>>,
    images: ExerciseImage[],
  ): Promise<Map<string, string | null>> {
    const entries = await Promise.all(
      exerciseIds.map(async (exerciseId) => {
        const fromVideo = videos.find(
          (video) => video.exerciseId === exerciseId && video.kind === 'primary' && video.thumbnail,
        )?.thumbnail;
        const standalone = images.find(
          (image) =>
            image.exerciseId === exerciseId &&
            (image.kind === 'thumbnail' || image.kind === 'poster'),
        );

        return [exerciseId, await this.urls.resolveUrl(fromVideo ?? standalone ?? null)] as const;
      }),
    );

    return new Map(entries);
  }
}
