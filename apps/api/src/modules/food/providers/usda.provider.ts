import { Injectable, Logger } from '@nestjs/common';
import { Nutrients, FoodKind } from '../types';
import { ExternalFood, inferCategory } from './provider.types';
import {
  ProviderResult,
  providerFailed,
  providerOk,
  providerUnconfigured,
} from './provider-result';

const BASE_URL = 'https://api.nal.usda.gov/fdc/v1';
const TIMEOUT_MS = 8000;

/** FoodData Central nutrient ids. */
const NUTRIENT_IDS = {
  protein: 1003,
  fat: 1004, // Total lipid
  carbs: 1005, // Carbohydrate, by difference
  fiber: 1079, // Fiber, total dietary
  sugar: 2000, // Sugars, total
  sodium: 1093, // Sodium, Na (mg)
} as const;

/**
 * Energy, in priority order. SR Legacy and Branded records use 1008, but
 * Foundation Foods often omit it and report only the Atwater variants — reading
 * 1008 alone returns 0 kcal for staples like raw chicken breast.
 */
const ENERGY_NUTRIENT_IDS = [
  1008, // Energy
  2048, // Energy (Atwater Specific Factors) — most accurate when present
  2047, // Energy (Atwater General Factors)
] as const;

const KJ_PER_KCAL = 4.184;

/**
 * Search results and detail records report nutrients under different shapes:
 * search gives `{ nutrientId, value }`, detail gives `{ nutrient: { id }, amount }`.
 */
interface UsdaNutrient {
  nutrientId?: number;
  value?: number;
  amount?: number;
  nutrient?: { id?: number; unitName?: string };
  unitName?: string;
}

interface UsdaFood {
  fdcId: number;
  description: string;
  dataType?: string;
  brandOwner?: string;
  brandName?: string;
  servingSize?: number;
  servingSizeUnit?: string;
  householdServingFullText?: string;
  foodCategory?: string | { description?: string };
  foodNutrients?: UsdaNutrient[];
}

/**
 * USDA FoodData Central — the primary source. Best coverage for whole and
 * generic foods, and its values are already per 100 g.
 */
@Injectable()
export class UsdaProvider {
  private readonly logger = new Logger(UsdaProvider.name);

  get isConfigured(): boolean {
    return !!process.env.USDA_FDC_API_KEY;
  }

  /**
   * Reports *why* it came back empty as well as what it found. Behaviour on
   * failure is unchanged — the caller still proceeds with no USDA results.
   */
  async search(query: string, limit: number): Promise<ProviderResult> {
    if (!this.isConfigured) return providerUnconfigured();

    const url = new URL(`${BASE_URL}/foods/search`);
    url.searchParams.set('api_key', process.env.USDA_FDC_API_KEY as string);
    url.searchParams.set('query', query);
    url.searchParams.set('pageSize', String(limit));
    // Foundation and SR Legacy are the curated generic foods; Branded fills the gaps.
    url.searchParams.set('dataType', 'Foundation,SR Legacy,Branded');

    const body = await this.request<{ foods?: UsdaFood[] }>(url);
    if (body === null) return providerFailed();

    return providerOk(
      (body.foods ?? [])
        .map((food) => this.normalise(food))
        .filter((food): food is ExternalFood => food !== null),
    );
  }

  async detail(fdcId: string): Promise<ExternalFood | null> {
    if (!this.isConfigured) return null;

    const url = new URL(`${BASE_URL}/food/${encodeURIComponent(fdcId)}`);
    url.searchParams.set('api_key', process.env.USDA_FDC_API_KEY as string);

    const body = await this.request<UsdaFood>(url);
    return body ? this.normalise(body) : null;
  }

  private async request<T>(url: URL): Promise<T | null> {
    try {
      const response = await fetch(url, { signal: AbortSignal.timeout(TIMEOUT_MS) });
      if (!response.ok) {
        this.logger.warn(`USDA responded ${response.status} for ${url.pathname}`);
        return null;
      }
      return (await response.json()) as T;
    } catch (error) {
      this.logger.warn(`USDA request failed: ${error instanceof Error ? error.message : error}`);
      return null;
    }
  }

  private nutrientValue(nutrients: UsdaNutrient[], id: number): number {
    const match = nutrients.find((n) => (n.nutrientId ?? n.nutrient?.id) === id);
    const value = match?.value ?? match?.amount ?? 0;
    // "Carbohydrate, by difference" is computed and occasionally lands slightly
    // below zero; never surface a negative macro.
    return Number.isFinite(value) && value > 0 ? value : 0;
  }

  /** First energy nutrient actually present, normalised to kcal. */
  private energyKcal(nutrients: UsdaNutrient[]): number {
    for (const id of ENERGY_NUTRIENT_IDS) {
      const match = nutrients.find((n) => (n.nutrientId ?? n.nutrient?.id) === id);
      if (!match) continue;

      const value = match.value ?? match.amount ?? 0;
      if (!Number.isFinite(value) || value <= 0) continue;

      const unit = (match.unitName ?? match.nutrient?.unitName ?? 'KCAL').toUpperCase();
      return unit === 'KJ' ? value / KJ_PER_KCAL : value;
    }
    return 0;
  }

  private normalise(food: UsdaFood): ExternalFood | null {
    if (!food?.fdcId || !food.description) return null;

    const nutrients = food.foodNutrients ?? [];
    const per100g: Nutrients = {
      calories: this.energyKcal(nutrients),
      protein: this.nutrientValue(nutrients, NUTRIENT_IDS.protein),
      carbs: this.nutrientValue(nutrients, NUTRIENT_IDS.carbs),
      fat: this.nutrientValue(nutrients, NUTRIENT_IDS.fat),
      fiber: this.nutrientValue(nutrients, NUTRIENT_IDS.fiber),
      sugar: this.nutrientValue(nutrients, NUTRIENT_IDS.sugar),
      sodium: this.nutrientValue(nutrients, NUTRIENT_IDS.sodium),
    };

    // Only grams convert cleanly to a per-100 g basis; ml and count units don't.
    const servingGrams =
      food.servingSizeUnit?.toLowerCase() === 'g' && food.servingSize ? food.servingSize : null;

    const rawBrand = food.brandName || food.brandOwner || null;
    const brand = rawBrand ? this.tidyName(rawBrand) : null;

    // Foundation and SR Legacy are USDA's curated generic foods; everything else
    // (Branded) is a packaged product.
    const kind: FoodKind =
      food.dataType && food.dataType.toLowerCase().startsWith('branded') ? 'branded' : 'generic';

    // Descriptions are shouted in SR Legacy ("APPLE, RAW"); title-case them.
    const name = this.tidyName(food.description);

    return {
      source: 'usda',
      externalId: String(food.fdcId),
      name,
      brand,
      kind,
      category: inferCategory(name, brand),
      per100g,
      servingGrams,
      servingLabel: food.householdServingFullText?.trim() || null,
      // FoodData Central exposes no image URLs.
      imageUrl: null,
    };
  }

  private tidyName(value: string): string {
    const trimmed = value.trim();
    // Leave mixed-case names alone; only fix the all-caps entries.
    if (trimmed !== trimmed.toUpperCase()) return trimmed;
    return trimmed
      .toLowerCase()
      .replace(
        /(^|[\s,(\-/])([a-z])/g,
        (_, prefix: string, letter: string) => prefix + letter.toUpperCase(),
      );
  }
}
