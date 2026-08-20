import { Inject, Injectable } from '@nestjs/common';
import { NodePgDatabase } from 'drizzle-orm/node-postgres';
import { and, asc, count, desc, eq, inArray, lt, SQL } from 'drizzle-orm';
import * as schema from '../../database/schema';
import type {
  ExerciseImage,
  ExerciseVideo,
  NewExerciseImage,
  NewExerciseVideo,
} from '../../database/schema';
import type { ExerciseVideoRecord } from './exercise-media.types';

export interface VideoFilter {
  exerciseId?: string;
  kind?: ExerciseVideo['kind'];
  status?: ExerciseVideo['status'];
  /** When false, only `ready` rows are returned — what the app is allowed to see. */
  includeUnready?: boolean;
}

export interface Page {
  limit: number;
  offset: number;
}

/**
 * Every exercise-media query lives here.
 *
 * The services above hold policy — what may be uploaded, who may delete, which
 * URL to hand out — and none of them build SQL. Keeping the two apart is what
 * makes the ordering rules ("primary before alternates, ready only") a single
 * definition rather than a condition repeated at each call site.
 */
@Injectable()
export class ExerciseMediaRepository {
  constructor(@Inject('DB_CONNECTION') private readonly db: NodePgDatabase<typeof schema>) {}

  // ─── Exercises ────────────────────────────────────────────

  /** Minimal existence/state check, so media routes can 404 before doing any work. */
  async findExercise(exerciseId: string) {
    return this.db.query.exercises.findFirst({
      where: eq(schema.exercises.id, exerciseId),
      columns: { id: true, name: true, slug: true, isPublished: true },
    });
  }

  // ─── Videos ───────────────────────────────────────────────

  async findVideo(id: string): Promise<ExerciseVideoRecord | undefined> {
    return this.db.query.exerciseVideos.findFirst({
      where: eq(schema.exerciseVideos.id, id),
      with: { thumbnail: true },
    });
  }

  /**
   * An exercise's videos, best first: the main demo, then previews and alternate
   * angles, each group in its configured order.
   */
  async findVideosByExercise(
    exerciseId: string,
    filter: Omit<VideoFilter, 'exerciseId'> = {},
  ): Promise<ExerciseVideoRecord[]> {
    return this.db.query.exerciseVideos.findMany({
      where: this.videoWhere({ ...filter, exerciseId }),
      with: { thumbnail: true },
      orderBy: [
        asc(schema.exerciseVideos.kind),
        asc(schema.exerciseVideos.orderIndex),
        asc(schema.exerciseVideos.createdAt),
      ],
    });
  }

  /** Videos for many exercises in one round trip — the list screen's query. */
  async findVideosByExercises(
    exerciseIds: string[],
    filter: Omit<VideoFilter, 'exerciseId'> = {},
  ): Promise<ExerciseVideoRecord[]> {
    if (exerciseIds.length === 0) return [];

    const conditions = [inArray(schema.exerciseVideos.exerciseId, exerciseIds)];
    if (!filter.includeUnready) conditions.push(eq(schema.exerciseVideos.status, 'ready'));
    if (filter.kind) conditions.push(eq(schema.exerciseVideos.kind, filter.kind));

    return this.db.query.exerciseVideos.findMany({
      where: and(...conditions),
      with: { thumbnail: true },
      orderBy: [asc(schema.exerciseVideos.kind), asc(schema.exerciseVideos.orderIndex)],
    });
  }

  async listVideos(
    filter: VideoFilter,
    page: Page,
  ): Promise<{ items: ExerciseVideoRecord[]; total: number }> {
    const where = this.videoWhere(filter);

    // Count and page in parallel: the total is needed for pagination either way,
    // and the two queries do not depend on each other.
    const [items, totals] = await Promise.all([
      this.db.query.exerciseVideos.findMany({
        where,
        with: { thumbnail: true },
        orderBy: [desc(schema.exerciseVideos.createdAt)],
        limit: page.limit,
        offset: page.offset,
      }),
      this.db.select({ value: count() }).from(schema.exerciseVideos).where(where),
    ]);

    return { items, total: Number(totals[0]?.value ?? 0) };
  }

  async insertVideo(values: NewExerciseVideo): Promise<ExerciseVideo> {
    const [created] = await this.db.insert(schema.exerciseVideos).values(values).returning();
    return created;
  }

  async updateVideo(
    id: string,
    values: Partial<NewExerciseVideo>,
  ): Promise<ExerciseVideo | undefined> {
    const [updated] = await this.db
      .update(schema.exerciseVideos)
      .set({ ...values, updatedAt: new Date() })
      .where(eq(schema.exerciseVideos.id, id))
      .returning();
    return updated;
  }

  async deleteVideo(id: string): Promise<ExerciseVideo | undefined> {
    const [deleted] = await this.db
      .delete(schema.exerciseVideos)
      .where(eq(schema.exerciseVideos.id, id))
      .returning();
    return deleted;
  }

  /**
   * Direct uploads whose bytes never arrived. Sweeping these keeps `pending` rows
   * from accumulating once a client abandons an upload.
   */
  async findAbandonedUploads(olderThan: Date, limit = 100): Promise<ExerciseVideo[]> {
    return this.db.query.exerciseVideos.findMany({
      where: and(
        eq(schema.exerciseVideos.status, 'pending'),
        lt(schema.exerciseVideos.createdAt, olderThan),
      ),
      limit,
    });
  }

  // ─── Images ───────────────────────────────────────────────

  async findImage(id: string): Promise<ExerciseImage | undefined> {
    return this.db.query.exerciseImages.findFirst({
      where: eq(schema.exerciseImages.id, id),
    });
  }

  async findImagesByExercise(
    exerciseId: string,
    kind?: ExerciseImage['kind'],
  ): Promise<ExerciseImage[]> {
    const conditions: SQL[] = [eq(schema.exerciseImages.exerciseId, exerciseId)];
    if (kind) conditions.push(eq(schema.exerciseImages.kind, kind));

    return this.db.query.exerciseImages.findMany({
      where: and(...conditions),
      orderBy: [asc(schema.exerciseImages.kind), asc(schema.exerciseImages.orderIndex)],
    });
  }

  async findImagesByExercises(exerciseIds: string[]): Promise<ExerciseImage[]> {
    if (exerciseIds.length === 0) return [];

    return this.db.query.exerciseImages.findMany({
      where: inArray(schema.exerciseImages.exerciseId, exerciseIds),
      orderBy: [asc(schema.exerciseImages.kind), asc(schema.exerciseImages.orderIndex)],
    });
  }

  async insertImage(values: NewExerciseImage): Promise<ExerciseImage> {
    const [created] = await this.db.insert(schema.exerciseImages).values(values).returning();
    return created;
  }

  async updateImage(
    id: string,
    values: Partial<NewExerciseImage>,
  ): Promise<ExerciseImage | undefined> {
    const [updated] = await this.db
      .update(schema.exerciseImages)
      .set({ ...values, updatedAt: new Date() })
      .where(eq(schema.exerciseImages.id, id))
      .returning();
    return updated;
  }

  async deleteImage(id: string): Promise<ExerciseImage | undefined> {
    const [deleted] = await this.db
      .delete(schema.exerciseImages)
      .where(eq(schema.exerciseImages.id, id))
      .returning();
    return deleted;
  }

  /** Videos still pointing at an image — checked before its bytes are removed. */
  async findVideosUsingThumbnail(imageId: string): Promise<ExerciseVideo[]> {
    return this.db.query.exerciseVideos.findMany({
      where: eq(schema.exerciseVideos.thumbnailImageId, imageId),
    });
  }

  // ─── Internals ────────────────────────────────────────────

  private videoWhere(filter: VideoFilter): SQL | undefined {
    const conditions: SQL[] = [];

    if (filter.exerciseId) {
      conditions.push(eq(schema.exerciseVideos.exerciseId, filter.exerciseId));
    }
    if (filter.kind) {
      conditions.push(eq(schema.exerciseVideos.kind, filter.kind));
    }
    if (filter.status) {
      conditions.push(eq(schema.exerciseVideos.status, filter.status));
    } else if (!filter.includeUnready) {
      // Half-uploaded and failed rows exist, but only an admin may see them.
      conditions.push(eq(schema.exerciseVideos.status, 'ready'));
    }

    return conditions.length > 0 ? and(...conditions) : undefined;
  }
}
