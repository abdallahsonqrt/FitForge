import { Inject, Injectable } from '@nestjs/common';
import { NodePgDatabase } from 'drizzle-orm/node-postgres';
import { and, asc, count, eq, inArray, or, sql, SQL } from 'drizzle-orm';
import * as schema from '../../database/schema';
import type {
  Equipment,
  Exercise,
  ExerciseCategory,
  ExerciseEquipment,
  ExerciseMuscle,
  Muscle,
  NewExercise,
} from '../../database/schema';

/** An exercise with its taxonomy joined — what every read in this module returns. */
export type ExerciseRecord = Exercise & {
  category: ExerciseCategory | null;
  muscles: (ExerciseMuscle & { muscle: Muscle })[];
  equipment: (ExerciseEquipment & { equipment: Equipment })[];
};

export interface ExerciseFilter {
  search?: string;
  categorySlug?: string;
  muscleSlug?: string;
  equipmentSlug?: string;
  difficulty?: Exercise['difficulty'];
  includeUnpublished?: boolean;
}

export interface Page {
  limit: number;
  offset: number;
}

/** The relation tree every exercise read pulls in. */
const WITH_TAXONOMY = {
  category: true,
  muscles: { with: { muscle: true } },
  equipment: { with: { equipment: true } },
} as const;

/**
 * All exercise-library SQL.
 *
 * Filtering by muscle or equipment is resolved as a subquery over the join table
 * rather than a join onto the main select: the relational query API returns the
 * nested taxonomy in one round trip, and an id list keeps that shape while still
 * hitting `exercise_muscles_muscle_role_idx`.
 */
@Injectable()
export class ExercisesRepository {
  constructor(@Inject('DB_CONNECTION') private readonly db: NodePgDatabase<typeof schema>) {}

  // ─── Exercises ────────────────────────────────────────────

  async findById(id: string): Promise<ExerciseRecord | undefined> {
    return this.db.query.exercises.findFirst({
      where: eq(schema.exercises.id, id),
      with: WITH_TAXONOMY,
    }) as Promise<ExerciseRecord | undefined>;
  }

  async findBySlug(slug: string): Promise<ExerciseRecord | undefined> {
    return this.db.query.exercises.findFirst({
      where: eq(schema.exercises.slug, slug),
      with: WITH_TAXONOMY,
    }) as Promise<ExerciseRecord | undefined>;
  }

  async list(
    filter: ExerciseFilter,
    page: Page,
  ): Promise<{ items: ExerciseRecord[]; total: number }> {
    const where = await this.buildWhere(filter);

    const [items, totals] = await Promise.all([
      this.db.query.exercises.findMany({
        where,
        with: WITH_TAXONOMY,
        orderBy: [asc(schema.exercises.name)],
        limit: page.limit,
        offset: page.offset,
      }) as Promise<ExerciseRecord[]>,
      this.db.select({ value: count() }).from(schema.exercises).where(where),
    ]);

    return { items, total: Number(totals[0]?.value ?? 0) };
  }

  async insert(values: NewExercise): Promise<Exercise> {
    const [created] = await this.db.insert(schema.exercises).values(values).returning();
    return created;
  }

  async update(id: string, values: Partial<NewExercise>): Promise<Exercise | undefined> {
    const [updated] = await this.db
      .update(schema.exercises)
      .set({ ...values, updatedAt: new Date() })
      .where(eq(schema.exercises.id, id))
      .returning();
    return updated;
  }

  async delete(id: string): Promise<Exercise | undefined> {
    const [deleted] = await this.db
      .delete(schema.exercises)
      .where(eq(schema.exercises.id, id))
      .returning();
    return deleted;
  }

  /**
   * How many workout days already programme this exercise. Deleting it would
   * cascade those rows away, so the count is checked first.
   */
  async countPlanUsages(exerciseId: string): Promise<number> {
    const [row] = await this.db
      .select({ value: count() })
      .from(schema.workoutExercises)
      .where(eq(schema.workoutExercises.exerciseId, exerciseId));

    return Number(row?.value ?? 0);
  }

  /** Storage keys of everything an exercise owns, so a delete can free the bytes too. */
  async findMediaKeys(exerciseId: string): Promise<string[]> {
    const [videos, images] = await Promise.all([
      this.db
        .select({ key: schema.exerciseVideos.storageKey, provider: schema.exerciseVideos.provider })
        .from(schema.exerciseVideos)
        .where(eq(schema.exerciseVideos.exerciseId, exerciseId)),
      this.db
        .select({ key: schema.exerciseImages.storageKey, provider: schema.exerciseImages.provider })
        .from(schema.exerciseImages)
        .where(eq(schema.exerciseImages.exerciseId, exerciseId)),
    ]);

    // `external` rows point at somebody else's URL — deleting those keys would be
    // meaningless at best.
    return [...videos, ...images]
      .filter((row) => row.provider !== 'external')
      .map((row) => row.key);
  }

  // ─── Relations ────────────────────────────────────────────

  /**
   * Replace an exercise's muscle links.
   *
   * Delete-then-insert inside a transaction, because the set as a whole is what
   * the caller specified — reconciling row by row would leave a window where an
   * exercise has no primary muscle.
   */
  async replaceMuscles(
    exerciseId: string,
    links: { muscleId: string; role: ExerciseMuscle['role']; orderIndex: number }[],
  ): Promise<void> {
    await this.db.transaction(async (tx) => {
      await tx
        .delete(schema.exerciseMuscles)
        .where(eq(schema.exerciseMuscles.exerciseId, exerciseId));

      if (links.length > 0) {
        await tx
          .insert(schema.exerciseMuscles)
          .values(links.map((link) => ({ exerciseId, ...link })));
      }
    });
  }

  async replaceEquipment(
    exerciseId: string,
    links: { equipmentId: string; isRequired: boolean; orderIndex: number }[],
  ): Promise<void> {
    await this.db.transaction(async (tx) => {
      await tx
        .delete(schema.exerciseEquipment)
        .where(eq(schema.exerciseEquipment.exerciseId, exerciseId));

      if (links.length > 0) {
        await tx
          .insert(schema.exerciseEquipment)
          .values(links.map((link) => ({ exerciseId, ...link })));
      }
    });
  }

  // ─── Taxonomy ─────────────────────────────────────────────

  async listCategories(): Promise<ExerciseCategory[]> {
    return this.db.query.exerciseCategories.findMany({
      orderBy: [asc(schema.exerciseCategories.orderIndex), asc(schema.exerciseCategories.name)],
    });
  }

  async listMuscles(): Promise<Muscle[]> {
    return this.db.query.muscles.findMany({
      orderBy: [asc(schema.muscles.region), asc(schema.muscles.name)],
    });
  }

  async listEquipment(): Promise<Equipment[]> {
    return this.db.query.equipment.findMany({ orderBy: [asc(schema.equipment.name)] });
  }

  /** Resolve `[id | slug, …]` against a catalogue in one query. */
  async resolveMuscles(refs: string[]): Promise<Muscle[]> {
    if (refs.length === 0) return [];
    return this.db.query.muscles.findMany({
      where: or(inArray(schema.muscles.slug, refs), this.idsIn(schema.muscles.id, refs)),
    });
  }

  async resolveEquipment(refs: string[]): Promise<Equipment[]> {
    if (refs.length === 0) return [];
    return this.db.query.equipment.findMany({
      where: or(inArray(schema.equipment.slug, refs), this.idsIn(schema.equipment.id, refs)),
    });
  }

  async findCategory(ref: string): Promise<ExerciseCategory | undefined> {
    return this.db.query.exerciseCategories.findFirst({
      where: or(
        eq(schema.exerciseCategories.slug, ref),
        this.idsIn(schema.exerciseCategories.id, [ref]),
      ),
    });
  }

  async insertCategory(
    values: typeof schema.exerciseCategories.$inferInsert,
  ): Promise<ExerciseCategory> {
    const [created] = await this.db.insert(schema.exerciseCategories).values(values).returning();
    return created;
  }

  async insertMuscle(values: typeof schema.muscles.$inferInsert): Promise<Muscle> {
    const [created] = await this.db.insert(schema.muscles).values(values).returning();
    return created;
  }

  async insertEquipment(values: typeof schema.equipment.$inferInsert): Promise<Equipment> {
    const [created] = await this.db.insert(schema.equipment).values(values).returning();
    return created;
  }

  // ─── Internals ────────────────────────────────────────────

  private async buildWhere(filter: ExerciseFilter): Promise<SQL | undefined> {
    const conditions: SQL[] = [];

    if (!filter.includeUnpublished) {
      conditions.push(eq(schema.exercises.isPublished, true));
    }
    if (filter.difficulty) {
      conditions.push(eq(schema.exercises.difficulty, filter.difficulty));
    }
    if (filter.search) {
      // Matches the `exercises_name_trgm_idx` expression, so a substring search
      // stays an index scan rather than a sequential one.
      const pattern = `%${filter.search.toLowerCase()}%`;
      conditions.push(sql`lower(${schema.exercises.name}) LIKE ${pattern}`);
    }
    if (filter.categorySlug) {
      const category = await this.findCategory(filter.categorySlug);
      // An unknown category must return nothing, not everything.
      conditions.push(
        category
          ? eq(schema.exercises.categoryId, category.id)
          : sql`false`,
      );
    }

    const idFilters = await Promise.all([
      filter.muscleSlug ? this.exerciseIdsForMuscle(filter.muscleSlug) : null,
      filter.equipmentSlug ? this.exerciseIdsForEquipment(filter.equipmentSlug) : null,
    ]);

    for (const ids of idFilters) {
      if (ids === null) continue;
      conditions.push(ids.length > 0 ? inArray(schema.exercises.id, ids) : sql`false`);
    }

    return conditions.length > 0 ? and(...conditions) : undefined;
  }

  private async exerciseIdsForMuscle(slug: string): Promise<string[]> {
    const rows = await this.db
      .select({ id: schema.exerciseMuscles.exerciseId })
      .from(schema.exerciseMuscles)
      .innerJoin(schema.muscles, eq(schema.muscles.id, schema.exerciseMuscles.muscleId))
      .where(eq(schema.muscles.slug, slug));

    return rows.map((row) => row.id);
  }

  private async exerciseIdsForEquipment(slug: string): Promise<string[]> {
    const rows = await this.db
      .select({ id: schema.exerciseEquipment.exerciseId })
      .from(schema.exerciseEquipment)
      .innerJoin(schema.equipment, eq(schema.equipment.id, schema.exerciseEquipment.equipmentId))
      .where(eq(schema.equipment.slug, slug));

    return rows.map((row) => row.id);
  }

  /**
   * `inArray` over a uuid column with a non-uuid string in the list is a Postgres
   * type error, so slugs are filtered out before they reach the query.
   */
  private idsIn(column: Parameters<typeof inArray>[0], refs: string[]): SQL {
    const uuids = refs.filter((ref) => UUID_PATTERN.test(ref));
    return uuids.length > 0 ? inArray(column, uuids) : sql`false`;
  }
}

const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
