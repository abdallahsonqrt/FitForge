import { Injectable, Logger } from '@nestjs/common';
import { Nutrients } from '../types';
import { ExternalFood, inferCategory } from './provider.types';
import { ProviderResult, providerFailed, providerOk } from './provider-result';

const BASE_URL = 'https://world.openfoodfacts.org';
const TIMEOUT_MS = 8000;
/** One retry: their 5xx responses are typically transient and per-request. */
const MAX_ATTEMPTS = 2;
const RETRY_DELAY_MS = 400;

/** Open Food Facts asks every client to identify itself. */
const USER_AGENT = 'FitForge/1.0 (fitness app; contact via app store listing)';

const FIELDS = [
  'code',
  'product_name',
  'brands',
  'nutriments',
  'serving_size',
  'serving_quantity',
  'image_front_small_url',
  'categories_tags',
].join(',');

interface OffProduct {
  code?: string;
  product_name?: string;
  brands?: string;
  serving_size?: string;
  serving_quantity?: number | string;
  image_front_small_url?: string;
  categories_tags?: string[];
  nutriments?: Record<string, number | string | undefined>;
}

const KJ_PER_KCAL = 4.184;

/**
 * Open Food Facts — the secondary source. Community-maintained and much stronger
 * than USDA on non-US packaged goods, at the cost of patchier data quality.
 */
@Injectable()
export class OpenFoodFactsProvider {
  private readonly logger = new Logger(OpenFoodFactsProvider.name);

  /**
   * Reports *why* it came back empty as well as what it found. Behaviour on
   * failure is unchanged — the caller still proceeds with no OFF results.
   */
  async search(query: string, limit: number): Promise<ProviderResult> {
    const url = new URL(`${BASE_URL}/cgi/search.pl`);
    url.searchParams.set('search_terms', query);
    url.searchParams.set('search_simple', '1');
    url.searchParams.set('action', 'process');
    url.searchParams.set('json', '1');
    url.searchParams.set('page_size', String(limit));
    url.searchParams.set('fields', FIELDS);

    const body = await this.request<{ products?: OffProduct[] }>(url);
    if (body === null) return providerFailed();

    return providerOk(
      (body.products ?? [])
        .map((product) => this.normalise(product))
        .filter((food): food is ExternalFood => food !== null),
    );
  }

  /** `ref` is the product barcode. */
  async detail(ref: string): Promise<ExternalFood | null> {
    const url = new URL(`${BASE_URL}/api/v2/product/${encodeURIComponent(ref)}.json`);
    url.searchParams.set('fields', FIELDS);

    const body = await this.request<{ product?: OffProduct; status?: number }>(url);
    return body?.product ? this.normalise(body.product) : null;
  }

  /**
   * Open Food Facts returns sporadic 5xx on individual requests even while the
   * service is up, so a single short retry recovers most of them. Persistent
   * failures resolve to null and the caller falls back to the other source.
   */
  private async request<T>(url: URL): Promise<T | null> {
    for (let attempt = 0; attempt < MAX_ATTEMPTS; attempt += 1) {
      try {
        const response = await fetch(url, {
          headers: { 'User-Agent': USER_AGENT, Accept: 'application/json' },
          signal: AbortSignal.timeout(TIMEOUT_MS),
        });

        if (response.ok) return (await response.json()) as T;

        // 4xx is our fault and won't change on retry; only 5xx is worth repeating.
        if (response.status < 500 || attempt === MAX_ATTEMPTS - 1) {
          this.logger.warn(`Open Food Facts responded ${response.status} for ${url.pathname}`);
          return null;
        }
      } catch (error) {
        if (attempt === MAX_ATTEMPTS - 1) {
          this.logger.warn(
            `Open Food Facts request failed: ${error instanceof Error ? error.message : error}`,
          );
          return null;
        }
      }

      await new Promise((resolve) => setTimeout(resolve, RETRY_DELAY_MS));
    }
    return null;
  }

  private num(value: number | string | undefined): number {
    const parsed = typeof value === 'string' ? Number.parseFloat(value) : value;
    return typeof parsed === 'number' && Number.isFinite(parsed) && parsed >= 0 ? parsed : 0;
  }

  private normalise(product: OffProduct): ExternalFood | null {
    const name = product.product_name?.trim();
    if (!product.code || !name) return null;

    const nutriments = product.nutriments ?? {};

    // Many entries carry only kilojoules, so convert when kcal is absent.
    let calories = this.num(nutriments['energy-kcal_100g']);
    if (calories === 0) {
      const kj = this.num(nutriments['energy-kj_100g']) || this.num(nutriments['energy_100g']);
      if (kj > 0) calories = kj / KJ_PER_KCAL;
    }

    const per100g: Nutrients = {
      calories,
      protein: this.num(nutriments['proteins_100g']),
      carbs: this.num(nutriments['carbohydrates_100g']),
      fat: this.num(nutriments['fat_100g']),
      fiber: this.num(nutriments['fiber_100g']),
      sugar: this.num(nutriments['sugars_100g']),
      // Reported in grams; the catalogue stores sodium in milligrams.
      sodium: this.num(nutriments['sodium_100g']) * 1000,
    };

    // `brands` is a comma-separated list; the first entry is the primary brand.
    const brand = product.brands?.split(',')[0]?.trim() || null;

    return {
      source: 'off',
      externalId: product.code,
      name,
      brand,
      // Open Food Facts catalogues packaged products exclusively.
      kind: 'branded',
      category: this.categoryFor(product, name, brand),
      per100g,
      servingGrams: this.num(product.serving_quantity) || null,
      servingLabel: product.serving_size?.trim() || null,
      imageUrl: product.image_front_small_url?.trim() || null,
    };
  }

  /**
   * Their `categories_tags` are language-prefixed slugs ("en:breakfast-cereals").
   * Feeding the readable part into the shared keyword matcher gets far better
   * results than the product name alone, which is often just a brand line.
   */
  private categoryFor(product: OffProduct, name: string, brand: string | null) {
    const tags = (product.categories_tags ?? [])
      .map((tag) => tag.replace(/^[a-z]{2}:/, '').replace(/-/g, ' '))
      .join(' ');

    const fromTags = tags ? inferCategory(tags) : 'other';
    return fromTags !== 'other' ? fromTags : inferCategory(name, brand);
  }
}
