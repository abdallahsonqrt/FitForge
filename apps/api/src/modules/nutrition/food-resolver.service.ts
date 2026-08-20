import { Injectable, Logger } from '@nestjs/common';
import { FoodSearchService } from '../food/food-search.service';
import {
  EMPTY_NUTRIENTS,
  FoodResult,
  Nutrients,
  ServingUnit,
  nutrientsForGrams,
} from '../food/types';
import { gramsPerUnit as fallbackGramsPerUnit, isMeasuredUnit } from '../food/search/servings';
import { DraftItem, ExtractedFood } from './types';

/** Below this the match is weak enough to be worth confirming with the user. */
export const LOW_CONFIDENCE = 0.45;

/** How many candidates to consider when picking the best match for a spoken name. */
const CANDIDATES = 5;

/**
 * The bridge between what someone said and what it is nutritionally.
 *
 * This is the service that makes the "AI does not calculate calories" rule true
 * in practice. It takes the model's `{ name, quantity, unit }`, finds the food in
 * the catalogue — falling through to USDA and Open Food Facts on a miss, which
 * `FoodSearchService` then stores locally — converts the portion to grams, and
 * scales the food's per-100 g figures. Every number in a logged meal originates
 * here, from a database row.
 */
@Injectable()
export class FoodResolverService {
  private readonly logger = new Logger(FoodResolverService.name);

  constructor(private readonly search: FoodSearchService) {}

  /**
   * Resolve several foods at once.
   *
   * Sequential rather than parallel on purpose. A miss can reach two external
   * providers, and firing a whole meal's worth of misses simultaneously turns one
   * sentence into a burst against a rate-limited API. Meals are 1–5 items and the
   * common case is a local index hit, so the ordering costs little.
   */
  async resolveAll(
    foods: ExtractedFood[],
    options: { language?: string; userId?: string } = {},
  ): Promise<DraftItem[]> {
    const items: DraftItem[] = [];
    for (const food of foods) {
      items.push(await this.resolve(food, options));
    }
    return items;
  }

  /**
   * Resolve one food. Always returns an item — an unmatched food becomes an
   * `foodId: null` entry with zero nutrition rather than vanishing, so the user
   * sees that we heard them and can correct it.
   */
  async resolve(
    food: ExtractedFood,
    options: { language?: string; userId?: string } = {},
  ): Promise<DraftItem> {
    const match = await this.bestMatch(food, options);

    if (!match) {
      return {
        foodId: null,
        name: this.titleCase(food.name),
        spokenName: food.name,
        quantity: food.quantity,
        unit: food.unit,
        grams: 0,
        servingLabel: `${this.formatQuantity(food.quantity)} ${food.unit}`,
        nutrients: EMPTY_NUTRIENTS,
        confidence: 0,
      };
    }

    return this.toDraftItem(match.food, food, match.confidence);
  }

  /**
   * Build a draft item from a known catalogue food. Used when resolution has
   * already happened — a clarification answered by picking an option, or a
   * quantity edit that rescales an item already matched.
   */
  toDraftItem(food: FoodResult, portion: ExtractedFood, confidence = 1): DraftItem {
    const grams = this.toGrams(food, portion.quantity, portion.unit);

    return {
      foodId: food.id,
      name: food.displayName || food.name,
      spokenName: portion.name,
      quantity: portion.quantity,
      unit: portion.unit,
      grams,
      servingLabel: this.servingLabel(portion.quantity, portion.unit, grams),
      nutrients: nutrientsForGrams(food.per100g, grams),
      confidence,
    };
  }

  /** Re-price an existing item at a new portion, without searching again. */
  async rescale(item: DraftItem, quantity: number, unit: ServingUnit): Promise<DraftItem> {
    if (!item.foodId) {
      return { ...item, quantity, unit, servingLabel: `${this.formatQuantity(quantity)} ${unit}` };
    }

    const food = await this.byId(item.foodId);
    if (!food) return item;

    return this.toDraftItem(
      food,
      { name: item.spokenName, quantity, unit },
      item.confidence,
    );
  }

  /** A catalogue food by id, or null if it has since been removed. */
  async byId(foodId: string): Promise<FoodResult | null> {
    try {
      return await this.search.findById(foodId);
    } catch {
      return null;
    }
  }

  /** The top few matches for a name — the options behind a "did you mean" prompt. */
  async candidatesFor(name: string, language?: string): Promise<FoodResult[]> {
    const { results } = await this.search.search({ query: name, limit: CANDIDATES, language });
    return results;
  }

  // ─── Internals ────────────────────────────────────────────

  private async bestMatch(
    food: ExtractedFood,
    options: { language?: string; userId?: string },
  ): Promise<{ food: FoodResult; confidence: number } | null> {
    // The note ("grilled", "with milk") is part of what identifies the food, so
    // it is searched with the name — but only as a first attempt. "Toast with
    // butter" finding nothing must still fall back to plain "Toast".
    const queries = food.note ? [`${food.name} ${food.note}`, food.name] : [food.name];

    for (const query of queries) {
      let results: FoodResult[] = [];
      try {
        // Only the flat ranked list matters here; grouping is a presentation
        // concern and the resolver is picking a single best match.
        ({ results } = await this.search.search({
          query,
          limit: CANDIDATES,
          language: options.language,
          userId: options.userId,
        }));
      } catch (error) {
        // A search failure must not take the whole conversation down; the item
        // simply comes back unresolved.
        this.logger.warn(
          `Food search failed for "${query}": ${error instanceof Error ? error.message : error}`,
        );
        continue;
      }

      const [top] = results;
      if (top) {
        return { food: top, confidence: this.confidenceOf(top, food.name) };
      }
    }

    return null;
  }

  /**
   * How sure we are this is the food they meant.
   *
   * The search score is the base signal. An exact name match is promoted to
   * certainty — "Egg" matching the catalogue's "Egg" needs no confirmation
   * regardless of how the ranker scored it against other candidates.
   */
  private confidenceOf(food: FoodResult, spokenName: string): number {
    const spoken = spokenName.trim().toLowerCase();

    // Every name the food answers to, including the compact one. Normalisation
    // stores "Egg" as the short name of a food whose provider name is
    // "Eggs, Grade A, Large, egg whole" — without it, someone saying "egg" is
    // asked to confirm a food that matched their word exactly.
    const exact = [food.name, food.displayName, food.shortName].some(
      (name) => name?.trim().toLowerCase() === spoken,
    );
    if (exact) return 1;

    return Math.min(food.score ?? 0.5, 0.99);
  }

  /**
   * Convert a spoken portion into grams.
   *
   * Precedence matters: a measured unit is fixed by definition, then a portion
   * recorded for this specific food ("1 breast = 172 g"), then the food's own
   * default serving, and only then the category-level fallback. Each step is a
   * better estimate than the next.
   */
  private toGrams(food: FoodResult, quantity: number, unit: ServingUnit): number {
    const recorded = food.servings.find((serving) => serving.unit === unit);

    // `gramsPerUnit` already enforces the precedence: mass is definitional and
    // ignores `recorded`, volume prefers a density measured for this food over
    // the 1 g/ml assumption. Passing the recorded value through is what lets a
    // millilitre of oil weigh 0.92 g here rather than 1 g.
    if (isMeasuredUnit(unit)) {
      return this.round(quantity * fallbackGramsPerUnit(unit, food.category, recorded?.gramsPerUnit));
    }

    if (recorded) {
      return this.round(quantity * recorded.gramsPerUnit);
    }

    // "1 serving" of a food means its default portion, whatever that is.
    if (unit === 'serving' && food.defaultGrams > 0) {
      return this.round(quantity * food.defaultGrams);
    }

    return this.round(quantity * fallbackGramsPerUnit(unit, food.category));
  }

  private servingLabel(quantity: number, unit: ServingUnit, grams: number): string {
    const portion = `${this.formatQuantity(quantity)} ${unit}`;
    // Repeating the weight is noise when the unit already is a weight.
    if (isMeasuredUnit(unit)) return portion;
    return `${portion} (${Math.round(grams)} g)`;
  }

  private formatQuantity(quantity: number): string {
    return Number.isInteger(quantity) ? String(quantity) : quantity.toFixed(1);
  }

  private round(grams: number): number {
    return Math.round(grams * 100) / 100;
  }

  private titleCase(name: string): string {
    return name.charAt(0).toUpperCase() + name.slice(1);
  }
}

/** Nutrition totals helper shared with the log service. */
export const scaleNutrients = (per100g: Nutrients, grams: number): Nutrients =>
  nutrientsForGrams(per100g, grams);
