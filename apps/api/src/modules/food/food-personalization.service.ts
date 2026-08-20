import { Inject, Injectable, NotFoundException } from '@nestjs/common';
import { NodePgDatabase } from 'drizzle-orm/node-postgres';
import { and, desc, eq, inArray, sql } from 'drizzle-orm';
import * as schema from '../../database/schema';
import { DB_CONNECTION } from '../../database/database.provider';
import { FoodCatalogService } from './food-catalog.service';
import { FoodResult } from './types';
import { UserAffinity } from './search/ranking';

export type MealType = 'breakfast' | 'lunch' | 'dinner' | 'snack';

/** Local hours each meal slot covers, used to pick the default suggestion set. */
const MEAL_WINDOWS: [MealType, number, number][] = [
  ['breakfast', 4, 11],
  ['lunch', 11, 16],
  ['dinner', 16, 22],
];

const MS_PER_DAY = 24 * 60 * 60 * 1000;

/**
 * Recents, favourites and the suggestion feed.
 *
 * Kept apart from `FoodSearchService` because these are per-user reads off small
 * indexed tables with no ranking, no fuzzy matching and no external calls — none
 * of the machinery a search needs.
 */
@Injectable()
export class FoodPersonalizationService {
  constructor(
    @Inject(DB_CONNECTION) private readonly db: NodePgDatabase<typeof schema>,
    private readonly catalog: FoodCatalogService,
  ) {}

  /**
   * Record that a user ate a food. Upserted rather than appended: the counter
   * and last-used timestamp are all the suggestion features read, so one row per
   * user+food keeps this a single write and the reads index-only.
   */
  async recordUsage(userId: string, foodId: string, mealType?: MealType): Promise<void> {
    await this.assertFoodExists(foodId, userId);

    await this.db
      .insert(schema.userFoodHistory)
      .values({ userId, foodId, lastMealType: mealType, usageCount: 1 })
      .onConflictDoUpdate({
        target: [schema.userFoodHistory.userId, schema.userFoodHistory.foodId],
        set: {
          lastUsed: new Date(),
          usageCount: sql`${schema.userFoodHistory.usageCount} + 1`,
          ...(mealType ? { lastMealType: mealType } : {}),
        },
      });

    // The food is now more popular globally, which feeds back into ranking.
    await this.db
      .update(schema.foods)
      .set({ popularity: sql`${schema.foods.popularity} + 1` })
      .where(eq(schema.foods.id, foodId));

  }

  /**
   * How strongly this user is attached to each of the given foods — the history
   * signal in search ranking.
   *
   * One query per table for the whole candidate pool, not per food. Returns only
   * the foods the user has some relationship with; the ranker treats a missing
   * entry as no signal rather than a negative one.
   */
  async affinitiesFor(userId: string, foodIds: string[]): Promise<Map<string, UserAffinity>> {
    if (foodIds.length === 0) return new Map();

    const [history, favorites] = await Promise.all([
      this.db
        .select({
          foodId: schema.userFoodHistory.foodId,
          usageCount: schema.userFoodHistory.usageCount,
          lastUsed: schema.userFoodHistory.lastUsed,
        })
        .from(schema.userFoodHistory)
        .where(
          and(
            eq(schema.userFoodHistory.userId, userId),
            inArray(schema.userFoodHistory.foodId, foodIds),
          ),
        ),
      this.db
        .select({ foodId: schema.favoriteFoods.foodId })
        .from(schema.favoriteFoods)
        .where(
          and(
            eq(schema.favoriteFoods.userId, userId),
            inArray(schema.favoriteFoods.foodId, foodIds),
          ),
        ),
    ]);

    const favoriteIds = new Set(favorites.map((row) => row.foodId));
    const affinities = new Map<string, UserAffinity>();

    const now = Date.now();
    for (const row of history) {
      affinities.set(row.foodId, {
        usageCount: row.usageCount,
        daysSinceUsed: Math.max(0, (now - row.lastUsed.getTime()) / MS_PER_DAY),
        isFavorite: favoriteIds.has(row.foodId),
      });
    }

    // A favourite never eaten still carries intent, so it needs an entry.
    for (const foodId of favoriteIds) {
      if (affinities.has(foodId)) continue;
      affinities.set(foodId, { usageCount: 0, daysSinceUsed: null, isFavorite: true });
    }

    return affinities;
  }

  /** Most recently eaten foods, newest first. */
  async recentFoods(userId: string, limit: number, language = 'en'): Promise<FoodResult[]> {
    const rows = await this.db
      .select({ foodId: schema.userFoodHistory.foodId })
      .from(schema.userFoodHistory)
      .where(eq(schema.userFoodHistory.userId, userId))
      .orderBy(desc(schema.userFoodHistory.lastUsed))
      .limit(limit);

    return this.hydrateIds(
      rows.map((row) => row.foodId),
      userId,
      language,
    );
  }

  /** Most frequently eaten foods — the user's staples. */
  async frequentFoods(userId: string, limit: number, language = 'en'): Promise<FoodResult[]> {
    const rows = await this.db
      .select({ foodId: schema.userFoodHistory.foodId })
      .from(schema.userFoodHistory)
      .where(eq(schema.userFoodHistory.userId, userId))
      .orderBy(desc(schema.userFoodHistory.usageCount), desc(schema.userFoodHistory.lastUsed))
      .limit(limit);

    return this.hydrateIds(
      rows.map((row) => row.foodId),
      userId,
      language,
    );
  }

  async favorites(userId: string, limit: number, language = 'en'): Promise<FoodResult[]> {
    const rows = await this.db
      .select({ foodId: schema.favoriteFoods.foodId })
      .from(schema.favoriteFoods)
      .where(eq(schema.favoriteFoods.userId, userId))
      .orderBy(desc(schema.favoriteFoods.createdAt))
      .limit(limit);

    return this.hydrateIds(
      rows.map((row) => row.foodId),
      userId,
      language,
    );
  }

  /** Idempotent: starring an already-starred food is a no-op, not an error. */
  async addFavorite(userId: string, foodId: string): Promise<{ favorited: true }> {
    await this.assertFoodExists(foodId, userId);

    await this.db
      .insert(schema.favoriteFoods)
      .values({ userId, foodId })
      .onConflictDoNothing({
        target: [schema.favoriteFoods.userId, schema.favoriteFoods.foodId],
      });

    return { favorited: true };
  }

  async removeFavorite(userId: string, foodId: string): Promise<{ favorited: false }> {
    await this.db
      .delete(schema.favoriteFoods)
      .where(
        and(eq(schema.favoriteFoods.userId, userId), eq(schema.favoriteFoods.foodId, foodId)),
      );

    return { favorited: false };
  }

  /**
   * The screen shown before anything is typed.
   *
   * Ordered by how likely each group is to be what the user wants: what they eat
   * at this hour, then what they starred, then what they ate last. A new user
   * with no history gets popular staples instead of an empty screen.
   */
  async suggestions(
    userId: string,
    language = 'en',
    now = new Date(),
  ): Promise<{
    mealType: MealType;
    forThisMeal: FoodResult[];
    favorites: FoodResult[];
    recent: FoodResult[];
  }> {
    const mealType = this.currentMealType(now);

    const [forThisMeal, favorites, recent] = await Promise.all([
      this.foodsForMeal(userId, mealType, 8, language),
      this.favorites(userId, 8, language),
      this.recentFoods(userId, 10, language),
    ]);

    return { mealType, forThisMeal, favorites, recent };
  }

  /**
   * What this user usually eats at this meal. Ranked by frequency *within* the
   * meal slot, which is what separates "coffee and eggs" at breakfast from
   * "chicken and rice" at dinner rather than blending them into one list.
   */
  async foodsForMeal(
    userId: string,
    mealType: MealType,
    limit: number,
    language = 'en',
  ): Promise<FoodResult[]> {
    const rows = await this.db
      .select({ foodId: schema.userFoodHistory.foodId })
      .from(schema.userFoodHistory)
      .where(
        and(
          eq(schema.userFoodHistory.userId, userId),
          eq(schema.userFoodHistory.lastMealType, mealType),
        ),
      )
      .orderBy(desc(schema.userFoodHistory.usageCount), desc(schema.userFoodHistory.lastUsed))
      .limit(limit);

    const results = await this.hydrateIds(
      rows.map((row) => row.foodId),
      userId,
      language,
    );

    // Cold start: a user with no history for this slot still gets a useful list.
    if (results.length === 0) {
      return this.popularStaples(userId, limit, language);
    }

    return results;
  }

  // ─── Internals ────────────────────────────────────────────

  private currentMealType(now: Date): MealType {
    const hour = now.getHours();
    const match = MEAL_WINDOWS.find(([, from, to]) => hour >= from && hour < to);
    return match ? match[0] : 'snack';
  }

  /** Verified, widely-logged foods — the fallback when a user has no history. */
  private async popularStaples(
    userId: string,
    limit: number,
    language: string,
  ): Promise<FoodResult[]> {
    const rows = await this.db
      .select({ id: schema.foods.id })
      .from(schema.foods)
      .where(eq(schema.foods.verified, true))
      .orderBy(desc(schema.foods.popularity))
      .limit(limit);

    return this.hydrateIds(
      rows.map((row) => row.id),
      userId,
      language,
    );
  }

  private async hydrateIds(
    foodIds: string[],
    userId: string,
    language: string,
  ): Promise<FoodResult[]> {
    if (foodIds.length === 0) return [];

    // Without `userId` the catalogue's owner filter collapses to "shared rows
    // only", which dropped every food the caller created themselves — exactly
    // the rows recents/frequents/favourites exist to show.
    const candidates = await this.catalog.findByIds(foodIds, userId);
    return this.catalog.hydrate(candidates, { language, userId });
  }

  /**
   * Guard before writing a row that references a food. Without it a bad id
   * surfaces as a raw foreign-key violation (a 500) instead of a clear 404.
   */
  private async assertFoodExists(foodId: string, viewerId: string): Promise<void> {
    const [food] = await this.db
      .select({ id: schema.foods.id })
      .from(schema.foods)
      .where(
        and(
          eq(schema.foods.id, foodId),
          // Same visibility rule the catalogue reads enforce: the shared
          // catalogue plus this viewer's own custom entries. Without it a user
          // holding someone else's private food id could favourite it and
          // inflate the popularity counter that feeds the shared ranker.
          sql`(${schema.foods.createdBy} is null or ${schema.foods.createdBy} = ${viewerId})`,
        ),
      )
      .limit(1);

    if (!food) throw new NotFoundException('That food could not be found.');
  }
}
