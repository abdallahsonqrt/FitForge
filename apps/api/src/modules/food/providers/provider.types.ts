import { FoodCategory, FoodKind, Nutrients } from '../types';

/**
 * A food as it arrives from an external provider, normalised but not yet stored.
 * `FoodCatalogService` turns these into `foods` rows.
 */
export interface ExternalFood {
  source: 'usda' | 'off';
  /** Provider-native id: USDA fdcId, or an Open Food Facts barcode. */
  externalId: string;
  name: string;
  brand: string | null;
  kind: FoodKind;
  category: FoodCategory;
  /** Always per 100 g — both providers are converted to this basis. */
  per100g: Nutrients;
  servingGrams: number | null;
  servingLabel: string | null;
  imageUrl: string | null;
}

/**
 * Keyword -> category. Providers don't agree on taxonomy (USDA has none for
 * Branded records, Open Food Facts uses free-form tags), so category is inferred
 * from the name. Order matters: the first match wins, so specific terms must
 * precede the general ones they contain.
 */
const CATEGORY_KEYWORDS: [FoodCategory, string[]][] = [
  ['supplements', ['whey', 'protein powder', 'creatine', 'bcaa', 'supplement', 'multivitamin']],
  [
    'drinks',
    ['juice', 'soda', 'cola', 'coffee', 'tea', 'water', 'smoothie', 'beverage', 'drink', 'latte'],
  ],
  [
    'seafood',
    ['fish', 'salmon', 'tuna', 'shrimp', 'prawn', 'cod', 'tilapia', 'crab', 'lobster', 'sardine'],
  ],
  [
    'meat',
    ['chicken', 'beef', 'pork', 'lamb', 'turkey', 'steak', 'bacon', 'sausage', 'ham', 'liver'],
  ],
  [
    'dairy',
    ['milk', 'cheese', 'yogurt', 'yoghurt', 'butter', 'cream', 'egg'],
  ],
  [
    'grains',
    ['rice', 'bread', 'pasta', 'oat', 'wheat', 'cereal', 'flour', 'quinoa', 'couscous', 'bulgur'],
  ],
  [
    'fruits',
    ['apple', 'banana', 'orange', 'grape', 'berry', 'melon', 'mango', 'peach', 'pear', 'date'],
  ],
  [
    'vegetables',
    ['tomato', 'potato', 'carrot', 'onion', 'spinach', 'lettuce', 'broccoli', 'pepper', 'cucumber'],
  ],
  [
    'snacks',
    ['chip', 'cookie', 'candy', 'chocolate', 'cracker', 'bar', 'popcorn', 'biscuit', 'ice cream'],
  ],
  [
    'restaurant',
    ['pizza', 'burger', 'sandwich', 'shawarma', 'falafel', 'taco', 'sushi', 'fries', 'kebab'],
  ],
];

export const inferCategory = (name: string, brand?: string | null): FoodCategory => {
  const haystack = `${name} ${brand ?? ''}`.toLowerCase();

  for (const [category, keywords] of CATEGORY_KEYWORDS) {
    if (keywords.some((keyword) => haystack.includes(keyword))) return category;
  }

  return 'other';
};
