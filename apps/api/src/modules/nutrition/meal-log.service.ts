import { Inject, Injectable, Logger, NotFoundException } from '@nestjs/common';
import { NodePgDatabase } from 'drizzle-orm/node-postgres';
import { and, asc, desc, eq, gte, inArray, lte, sql } from 'drizzle-orm';
import * as schema from '../../database/schema';
import { DB_CONNECTION } from '../../database/database.provider';
import { FoodPersonalizationService } from '../food/food-personalization.service';
import { StreaksService } from '../streaks/streaks.service';
import { BadgesService } from '../badges/badges.service';
import { EMPTY_NUTRIENTS, Nutrients } from '../food/types';
import { FoodResolverService } from './food-resolver.service';
import {
  DayQueryDto,
  HistoryQueryDto,
  LegacyLogMealDto,
  LogMealDto,
  MealType,
} from './dto/log-meal.dto';
import { DraftItem, describeMeal, sumNutrients } from './types';

/** A logged meal as returned by the API. */
export interface LoggedMeal {
  id: string;
  name: string;
  type: MealType;
  source: 'manual' | 'ai' | 'quick';
  date: string;
  createdAt: string;
  totals: Nutrients;
  items: {
    id: string;
    foodId: string | null;
    name: string;
    quantity: number;
    unit: string;
    grams: number;
    servingSize: string | null;
    nutrients: Nutrients;
  }[];
}

/**
 * The meal log: writing meals, reading days, and summarising history.
 *
 * Meal totals are stored on the `meals` row rather than aggregated on read.
 * That is a deliberate denormalisation — the totals are written in the same
 * transaction as the items they sum, and it turns the app's most frequent query
 * ("today's calories", on every home screen render) into a single indexed range
 * scan with no join.
 */
@Injectable()
export class MealLogService {
  private readonly logger = new Logger(MealLogService.name);

  constructor(
    @Inject(DB_CONNECTION) private readonly db: NodePgDatabase<typeof schema>,
    private readonly resolver: FoodResolverService,
    private readonly personalization: FoodPersonalizationService,
    private readonly streaks: StreaksService,
    private readonly badges: BadgesService,
  ) {}

  /**
   * A logged meal marks the day as active and may complete a badge.
   *
   * Neither may fail the log: the meal row is already committed, and a rejection
   * here would surface as a 500 for a meal that was in fact saved.
   */
  private async recordEngagement(userId: string, day: string): Promise<void> {
    await this.streaks.recordActivity(userId, day).catch(() => undefined);
    await this.badges.evaluateQuietly(userId);
  }

  /**
   * Log a meal from explicit item input — the manual path behind
   * `POST /nutrition/log`.
   *
   * Nutrition comes from the catalogue for every item carrying a `foodId`. The
   * request never supplies macros: a client that could post its own numbers
   * could post wrong ones, and the same food would then read differently
   * depending on which screen logged it.
   */
  async log(userId: string, dto: LogMealDto): Promise<LoggedMeal> {
    const items: DraftItem[] = [];

    for (const input of dto.items) {
      if (input.foodId) {
        const food = await this.resolver.byId(input.foodId);
        if (!food) {
          throw new NotFoundException(`No food found with id ${input.foodId}.`);
        }

        const item = this.resolver.toDraftItem(food, {
          name: input.name ?? food.name,
          quantity: input.quantity,
          unit: input.unit,
        });

        // An explicit gram weight from the client wins over the unit conversion:
        // it means the user set the portion by weight in the picker.
        items.push(input.grams ? this.repriceAt(item, food.per100g, input.grams) : item);
        continue;
      }

      // Free-text item: recorded so the meal reads correctly, with no invented
      // nutrition attached to it.
      items.push({
        foodId: null,
        name: input.name!,
        spokenName: input.name!,
        quantity: input.quantity,
        unit: input.unit,
        grams: input.grams ?? 0,
        servingLabel: `${input.quantity} ${input.unit}`,
        nutrients: EMPTY_NUTRIENTS,
        confidence: 0,
      });
    }

    return this.persist(userId, items, {
      name: dto.name,
      type: dto.type,
      date: dto.date ?? this.today(),
      source: 'manual',
    });
  }

  /** Commit a conversational draft. Called by the chat service. */
  async logDraft(
    userId: string,
    items: DraftItem[],
    options: { type: MealType; date: string; name?: string },
  ): Promise<LoggedMeal> {
    return this.persist(userId, items, {
      name: options.name,
      type: options.type,
      date: options.date,
      source: 'ai',
    });
  }

  /**
   * The legacy `POST /meals` contract: a name and a set of totals, no items.
   * Retained so the shipped mobile calculator keeps working.
   */
  async logMacros(userId: string, dto: LegacyLogMealDto): Promise<LoggedMeal> {
    const [meal] = await this.db
      .insert(schema.meals)
      .values({
        userId,
        name: dto.name,
        type: dto.type,
        source: 'quick',
        calories: dto.calories,
        protein: dto.protein,
        carbs: dto.carbs,
        fat: dto.fat,
        date: dto.date,
      })
      .returning();

    await this.recordEngagement(userId, dto.date);

    return this.hydrate(meal, []);
  }

  /** Replace a saved meal's items and re-sum its totals. Used by chat edits. */
  async replaceItems(userId: string, mealId: string, items: DraftItem[]): Promise<LoggedMeal> {
    const meal = await this.findOwned(userId, mealId);
    const totals = sumNutrients(items);

    const updated = await this.db.transaction(async (tx) => {
      await tx.delete(schema.mealItems).where(eq(schema.mealItems.mealId, mealId));

      if (items.length > 0) {
        await tx.insert(schema.mealItems).values(items.map((item) => this.toItemRow(mealId, item)));
      }

      const [row] = await tx
        .update(schema.meals)
        .set({
          name: describeMeal(items),
          ...totals,
          updatedAt: new Date(),
        })
        .where(eq(schema.meals.id, mealId))
        .returning();

      return row;
    });

    return this.hydrate(updated ?? meal, items);
  }

  /** A day's meals with the day's totals. */
  async day(userId: string, query: DayQueryDto) {
    const date = query.date ?? this.today();
    const meals = await this.mealsBetween(userId, date, date);
    const totals = sumNutrients(meals.map((meal) => ({ nutrients: meal.totals })));

    return { date, totals, meals };
  }

  /**
   * Daily totals over a range, newest first.
   *
   * Aggregated in SQL rather than by loading every meal: a 90-day window is a
   * few thousand rows the API would otherwise fetch only to sum and discard.
   */
  async history(userId: string, query: HistoryQueryDto) {
    const to = query.to ?? this.today();
    const from = query.from ?? this.daysBefore(to, query.limit - 1);

    const result = await this.db.execute<{
      date: string;
      meal_count: number;
      calories: number;
      protein: number;
      carbs: number;
      fat: number;
      fiber: number;
      sugar: number;
      sodium: number;
    }>(sql`
      select
        to_char(date, 'YYYY-MM-DD') as date,
        count(*)::int as meal_count,
        sum(calories) as calories,
        sum(protein) as protein,
        sum(carbs) as carbs,
        sum(fat) as fat,
        sum(fiber) as fiber,
        sum(sugar) as sugar,
        sum(sodium) as sodium
      from meals
      where user_id = ${userId} and date between ${from} and ${to}
      group by date
      order by date desc
      limit ${query.limit}
    `);

    const num = (value: unknown) => {
      const parsed = typeof value === 'string' ? Number.parseFloat(value) : Number(value);
      return Number.isFinite(parsed) ? parsed : 0;
    };

    const days = result.rows.map((row) => ({
      date: row.date,
      mealCount: num(row.meal_count),
      totals: {
        calories: Math.round(num(row.calories)),
        protein: Math.round(num(row.protein) * 10) / 10,
        carbs: Math.round(num(row.carbs) * 10) / 10,
        fat: Math.round(num(row.fat) * 10) / 10,
        fiber: Math.round(num(row.fiber) * 10) / 10,
        sugar: Math.round(num(row.sugar) * 10) / 10,
        sodium: Math.round(num(row.sodium) * 10) / 10,
      },
    }));

    const averages = this.averageOf(days.map((day) => day.totals));

    return { from, to, days, averages };
  }

  /** Every meal in a date range, items included. */
  async mealsBetween(userId: string, from: string, to: string): Promise<LoggedMeal[]> {
    const rows = await this.db
      .select()
      .from(schema.meals)
      .where(
        and(
          eq(schema.meals.userId, userId),
          gte(schema.meals.date, from),
          lte(schema.meals.date, to),
        ),
      )
      .orderBy(desc(schema.meals.date), asc(schema.meals.createdAt));

    if (rows.length === 0) return [];

    const itemRows = await this.db
      .select()
      .from(schema.mealItems)
      .where(
        inArray(
          schema.mealItems.mealId,
          rows.map((row) => row.id),
        ),
      )
      .orderBy(asc(schema.mealItems.createdAt));

    const byMeal = new Map<string, (typeof itemRows)[number][]>();
    for (const item of itemRows) {
      const list = byMeal.get(item.mealId) ?? [];
      list.push(item);
      byMeal.set(item.mealId, list);
    }

    return rows.map((row) => this.hydrateRows(row, byMeal.get(row.id) ?? []));
  }

  /**
   * A named meal from a past day — what "the same breakfast as yesterday"
   * resolves to. Returns the most recent when the day holds several.
   */
  async findByTypeOnDate(
    userId: string,
    date: string,
    type: MealType,
  ): Promise<LoggedMeal | null> {
    const [row] = await this.db
      .select()
      .from(schema.meals)
      .where(
        and(
          eq(schema.meals.userId, userId),
          eq(schema.meals.date, date),
          eq(schema.meals.type, type),
        ),
      )
      .orderBy(desc(schema.meals.createdAt))
      .limit(1);

    if (!row) return null;

    const items = await this.db
      .select()
      .from(schema.mealItems)
      .where(eq(schema.mealItems.mealId, row.id))
      .orderBy(asc(schema.mealItems.createdAt));

    return this.hydrateRows(row, items);
  }

  /** Delete a meal. Ownership is checked, not assumed. */
  async remove(userId: string, mealId: string): Promise<{ id: string; deleted: true }> {
    const [deleted] = await this.db
      .delete(schema.meals)
      .where(and(eq(schema.meals.id, mealId), eq(schema.meals.userId, userId)))
      .returning({ id: schema.meals.id });

    // Deliberately the same 404 whether the meal is missing or someone else's —
    // a distinct 403 would confirm that another user's meal id exists.
    if (!deleted) {
      throw new NotFoundException('That meal could not be found.');
    }

    return { id: deleted.id, deleted: true };
  }

  /** One meal by id, scoped to its owner. */
  async findOne(userId: string, mealId: string): Promise<LoggedMeal> {
    const meal = await this.findOwned(userId, mealId);
    const items = await this.db
      .select()
      .from(schema.mealItems)
      .where(eq(schema.mealItems.mealId, mealId))
      .orderBy(asc(schema.mealItems.createdAt));

    return this.hydrateRows(meal, items);
  }

  // ─── Internals ────────────────────────────────────────────

  /**
   * Write a meal and its items atomically.
   *
   * The meal row and its items must not be able to disagree: a partial write
   * would leave totals that no longer sum their items, and every read path
   * trusts those totals.
   */
  private async persist(
    userId: string,
    items: DraftItem[],
    options: { name?: string; type: MealType; date: string; source: 'manual' | 'ai' | 'quick' },
  ): Promise<LoggedMeal> {
    const totals = sumNutrients(items);

    const meal = await this.db.transaction(async (tx) => {
      const [row] = await tx
        .insert(schema.meals)
        .values({
          userId,
          name: options.name ?? describeMeal(items),
          type: options.type,
          source: options.source,
          date: options.date,
          ...totals,
        })
        .returning();

      if (items.length > 0) {
        await tx.insert(schema.mealItems).values(items.map((item) => this.toItemRow(row.id, item)));
      }

      return row;
    });

    await this.recordUsage(userId, items, options.type);
    await this.recordEngagement(userId, options.date);

    return this.hydrate(meal, items);
  }

  /**
   * Feed the personalisation signals. Best-effort: this drives suggestion
   * quality, and failing it must never undo a meal the user successfully logged.
   */
  private async recordUsage(userId: string, items: DraftItem[], type: MealType): Promise<void> {
    const foodIds = [...new Set(items.map((item) => item.foodId).filter((id): id is string => !!id))];

    await Promise.all(
      foodIds.map((foodId) =>
        this.personalization.recordUsage(userId, foodId, type).catch((error) => {
          this.logger.warn(
            `Could not record usage of food ${foodId}: ${
              error instanceof Error ? error.message : error
            }`,
          );
        }),
      ),
    );
  }

  private async findOwned(userId: string, mealId: string) {
    const [meal] = await this.db
      .select()
      .from(schema.meals)
      .where(and(eq(schema.meals.id, mealId), eq(schema.meals.userId, userId)))
      .limit(1);

    if (!meal) {
      throw new NotFoundException('That meal could not be found.');
    }
    return meal;
  }

  private toItemRow(mealId: string, item: DraftItem) {
    return {
      mealId,
      foodId: item.foodId,
      name: item.name,
      quantity: item.quantity,
      unit: item.unit,
      grams: item.grams,
      servingSize: item.servingLabel.slice(0, 100),
      ...item.nutrients,
    };
  }

  private repriceAt(item: DraftItem, per100g: Nutrients, grams: number): DraftItem {
    const factor = grams / 100;
    return {
      ...item,
      grams,
      unit: 'g',
      quantity: grams,
      servingLabel: `${Math.round(grams)} g`,
      nutrients: {
        calories: Math.round(per100g.calories * factor),
        protein: Math.round(per100g.protein * factor * 10) / 10,
        carbs: Math.round(per100g.carbs * factor * 10) / 10,
        fat: Math.round(per100g.fat * factor * 10) / 10,
        fiber: Math.round(per100g.fiber * factor * 10) / 10,
        sugar: Math.round(per100g.sugar * factor * 10) / 10,
        sodium: Math.round(per100g.sodium * factor * 10) / 10,
      },
    };
  }

  private hydrate(meal: typeof schema.meals.$inferSelect, items: DraftItem[]): LoggedMeal {
    return {
      id: meal.id,
      name: meal.name,
      type: meal.type,
      source: meal.source,
      date: meal.date,
      createdAt: meal.createdAt.toISOString(),
      totals: {
        calories: meal.calories,
        protein: meal.protein,
        carbs: meal.carbs,
        fat: meal.fat,
        fiber: meal.fiber,
        sugar: meal.sugar,
        sodium: meal.sodium,
      },
      items: items.map((item, index) => ({
        id: `${meal.id}:${index}`,
        foodId: item.foodId,
        name: item.name,
        quantity: item.quantity,
        unit: item.unit,
        grams: item.grams,
        servingSize: item.servingLabel,
        nutrients: item.nutrients,
      })),
    };
  }

  private hydrateRows(
    meal: typeof schema.meals.$inferSelect,
    items: (typeof schema.mealItems.$inferSelect)[],
  ): LoggedMeal {
    return {
      id: meal.id,
      name: meal.name,
      type: meal.type,
      source: meal.source,
      date: meal.date,
      createdAt: meal.createdAt.toISOString(),
      totals: {
        calories: meal.calories,
        protein: meal.protein,
        carbs: meal.carbs,
        fat: meal.fat,
        fiber: meal.fiber,
        sugar: meal.sugar,
        sodium: meal.sodium,
      },
      items: items.map((item) => ({
        id: item.id,
        foodId: item.foodId,
        name: item.name,
        quantity: item.quantity,
        unit: item.unit,
        grams: item.grams,
        servingSize: item.servingSize,
        nutrients: {
          calories: item.calories,
          protein: item.protein,
          carbs: item.carbs,
          fat: item.fat,
          fiber: item.fiber,
          sugar: item.sugar,
          sodium: item.sodium,
        },
      })),
    };
  }

  private averageOf(totals: Nutrients[]): Nutrients {
    if (totals.length === 0) return EMPTY_NUTRIENTS;

    const summed = sumNutrients(totals.map((nutrients) => ({ nutrients })));
    const divide = (value: number, decimals = 1) => {
      const average = value / totals.length;
      const factor = 10 ** decimals;
      return Math.round(average * factor) / factor;
    };

    return {
      calories: divide(summed.calories, 0),
      protein: divide(summed.protein),
      carbs: divide(summed.carbs),
      fat: divide(summed.fat),
      fiber: divide(summed.fiber),
      sugar: divide(summed.sugar),
      sodium: divide(summed.sodium),
    };
  }

  private today(): string {
    return new Date().toISOString().slice(0, 10);
  }

  private daysBefore(date: string, days: number): string {
    const base = new Date(`${date}T00:00:00Z`);
    base.setUTCDate(base.getUTCDate() - Math.max(days, 0));
    return base.toISOString().slice(0, 10);
  }
}
