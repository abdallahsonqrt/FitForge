import { NodePgDatabase } from 'drizzle-orm/node-postgres';
import { eq, and } from 'drizzle-orm';
import * as schema from '../schema';
import { normalize } from '../../modules/food/search/normalize';
import {
  keywordsToSearchBlob,
  normalizeFood,
} from '../../modules/food/normalization/food-normalizer';

/**
 * The starter food catalogue.
 *
 * Search is local-first, so an empty `foods` table means every early query pays
 * a network round trip and Arabic finds nothing at all — USDA has no Arabic
 * names and no kunafa. This set covers the staples people log daily plus the
 * Middle Eastern dishes the external providers handle worst, which is what makes
 * the feature usable from a cold database.
 *
 * `popularity` seeds the ranking tie-breaker; real usage adds to it from there.
 */

type Category = (typeof schema.foodCategoryEnum.enumValues)[number];
type Unit = (typeof schema.servingUnitEnum.enumValues)[number];

interface SeedServing {
  name: string;
  amount: number;
  unit: Unit;
  /** Grams in one unit — the conversion back to the per-100 g figures. */
  gramsPerUnit: number;
  isDefault?: boolean;
}

interface SeedFood {
  name: string;
  category: Category;
  /** Per 100 g: [calories, protein, carbs, fat, fiber?, sugar?, sodium mg?] */
  per100g: [number, number, number, number, number?, number?, number?];
  popularity: number;
  /** Arabic names; the first is the one displayed, the rest are search aliases. */
  ar: string[];
  servings?: SeedServing[];
}

const FOODS: SeedFood[] = [
  // ─── Meat & poultry ──────────────────────────────────────
  {
    name: 'Chicken breast, raw',
    category: 'meat',
    per100g: [165, 31, 0, 3.6, 0, 0, 74],
    popularity: 100,
    ar: ['صدر دجاج', 'صدور دجاج', 'دجاج', 'فراخ'],
    servings: [
      { name: '1 breast (172 g)', amount: 1, unit: 'piece', gramsPerUnit: 172, isDefault: true },
      { name: '100 g', amount: 100, unit: 'g', gramsPerUnit: 1 },
    ],
  },
  {
    name: 'Grilled chicken breast',
    category: 'meat',
    per100g: [195, 29.6, 0, 7.8, 0, 0, 90],
    popularity: 92,
    ar: ['صدر دجاج مشوي', 'دجاج مشوي'],
    servings: [
      { name: '1 breast (150 g)', amount: 1, unit: 'piece', gramsPerUnit: 150, isDefault: true },
    ],
  },
  {
    name: 'Chicken thigh, cooked',
    category: 'meat',
    per100g: [209, 26, 0, 10.9, 0, 0, 88],
    popularity: 70,
    ar: ['فخذ دجاج', 'ورك دجاج'],
    servings: [{ name: '1 thigh (110 g)', amount: 1, unit: 'piece', gramsPerUnit: 110 }],
  },
  {
    name: 'Chicken wings, cooked',
    category: 'meat',
    per100g: [203, 30.5, 0, 8.1, 0, 0, 82],
    popularity: 60,
    ar: ['أجنحة دجاج', 'جوانح دجاج'],
    servings: [{ name: '1 wing (34 g)', amount: 1, unit: 'piece', gramsPerUnit: 34 }],
  },
  {
    name: 'Ground beef, 85% lean',
    category: 'meat',
    per100g: [250, 26, 0, 15, 0, 0, 75],
    popularity: 75,
    ar: ['لحم مفروم', 'لحمة مفرومة'],
  },
  {
    name: 'Beef steak, grilled',
    category: 'meat',
    per100g: [271, 25.9, 0, 18.3, 0, 0, 60],
    popularity: 65,
    ar: ['ستيك لحم', 'شريحة لحم', 'لحم بقري'],
    servings: [{ name: '1 steak (220 g)', amount: 1, unit: 'piece', gramsPerUnit: 220 }],
  },
  {
    name: 'Lamb, cooked',
    category: 'meat',
    per100g: [294, 25, 0, 21, 0, 0, 72],
    popularity: 50,
    ar: ['لحم ضاني', 'لحم خروف'],
  },
  {
    name: 'Turkey breast, cooked',
    category: 'meat',
    per100g: [135, 30, 0, 1, 0, 0, 1015],
    popularity: 45,
    ar: ['صدر ديك رومي', 'ديك رومي'],
  },

  // ─── Seafood ─────────────────────────────────────────────
  {
    name: 'Salmon, cooked',
    category: 'seafood',
    per100g: [208, 20, 0, 13, 0, 0, 59],
    popularity: 80,
    ar: ['سلمون', 'سمك سلمون'],
    servings: [{ name: '1 fillet (170 g)', amount: 1, unit: 'piece', gramsPerUnit: 170 }],
  },
  {
    name: 'Tuna, canned in water',
    category: 'seafood',
    per100g: [116, 26, 0, 0.8, 0, 0, 247],
    popularity: 78,
    ar: ['تونة', 'سمك تونة'],
    servings: [{ name: '1 can (142 g)', amount: 1, unit: 'piece', gramsPerUnit: 142 }],
  },
  {
    name: 'Shrimp, cooked',
    category: 'seafood',
    per100g: [99, 24, 0.2, 0.3, 0, 0, 111],
    popularity: 55,
    ar: ['جمبري', 'روبيان', 'قريدس'],
  },

  // ─── Dairy & eggs ────────────────────────────────────────
  {
    name: 'Egg, whole, raw',
    category: 'dairy',
    per100g: [143, 12.6, 0.7, 9.5, 0, 0.4, 142],
    popularity: 100,
    ar: ['بيض', 'بيضة'],
    servings: [
      { name: '1 large egg (50 g)', amount: 1, unit: 'piece', gramsPerUnit: 50, isDefault: true },
      { name: '2 eggs (100 g)', amount: 2, unit: 'piece', gramsPerUnit: 50 },
    ],
  },
  {
    name: 'Egg, scrambled',
    category: 'dairy',
    per100g: [149, 10, 1.6, 11, 0, 1.4, 145],
    popularity: 70,
    ar: ['بيض مخفوق', 'بيض مقلي'],
  },
  {
    name: 'Milk, whole',
    category: 'dairy',
    per100g: [61, 3.2, 4.8, 3.3, 0, 5.1, 43],
    popularity: 90,
    ar: ['حليب', 'لبن'],
    servings: [
      { name: '1 cup (244 g)', amount: 1, unit: 'cup', gramsPerUnit: 244, isDefault: true },
    ],
  },
  {
    name: 'Greek yogurt, plain',
    category: 'dairy',
    per100g: [59, 10, 3.6, 0.4, 0, 3.2, 36],
    popularity: 85,
    ar: ['زبادي يوناني', 'زبادي', 'لبن زبادي'],
    servings: [{ name: '1 cup (245 g)', amount: 1, unit: 'cup', gramsPerUnit: 245 }],
  },
  {
    name: 'Cheddar cheese',
    category: 'dairy',
    per100g: [403, 25, 1.3, 33, 0, 0.5, 621],
    popularity: 60,
    ar: ['جبنة شيدر', 'جبنة'],
    servings: [{ name: '1 slice (28 g)', amount: 1, unit: 'slice', gramsPerUnit: 28 }],
  },
  {
    name: 'Feta cheese',
    category: 'dairy',
    per100g: [264, 14.2, 4.1, 21.3, 0, 4.1, 1116],
    popularity: 50,
    ar: ['جبنة فيتا', 'جبنة بيضاء'],
  },
  {
    name: 'Butter',
    category: 'dairy',
    per100g: [717, 0.9, 0.1, 81, 0, 0.1, 643],
    popularity: 55,
    ar: ['زبدة'],
    servings: [{ name: '1 tbsp (14 g)', amount: 1, unit: 'tablespoon', gramsPerUnit: 14 }],
  },

  // ─── Grains ──────────────────────────────────────────────
  {
    name: 'White rice, cooked',
    category: 'grains',
    per100g: [130, 2.7, 28, 0.3, 0.4, 0.1, 1],
    popularity: 100,
    ar: ['أرز أبيض', 'أرز', 'رز'],
    servings: [
      { name: '1 cup (158 g)', amount: 1, unit: 'cup', gramsPerUnit: 158, isDefault: true },
    ],
  },
  {
    name: 'Brown rice, cooked',
    category: 'grains',
    per100g: [112, 2.3, 24, 0.8, 1.8, 0.4, 5],
    popularity: 70,
    ar: ['أرز بني', 'رز بني'],
    servings: [{ name: '1 cup (195 g)', amount: 1, unit: 'cup', gramsPerUnit: 195 }],
  },
  {
    name: 'Whole wheat bread',
    category: 'grains',
    per100g: [247, 13, 41, 3.4, 7, 6, 450],
    popularity: 80,
    ar: ['خبز أسمر', 'خبز قمح كامل', 'عيش'],
    servings: [
      { name: '1 slice (32 g)', amount: 1, unit: 'slice', gramsPerUnit: 32, isDefault: true },
    ],
  },
  {
    name: 'White bread',
    category: 'grains',
    per100g: [265, 9, 49, 3.2, 2.7, 5, 491],
    popularity: 75,
    ar: ['خبز أبيض', 'توست', 'عيش أبيض'],
    servings: [
      { name: '1 slice (28 g)', amount: 1, unit: 'slice', gramsPerUnit: 28, isDefault: true },
    ],
  },
  {
    name: 'Pita bread',
    category: 'grains',
    per100g: [275, 9.1, 55.7, 1.2, 2.2, 1.2, 536],
    popularity: 70,
    ar: ['خبز عربي', 'خبز بيتا', 'رغيف'],
    servings: [{ name: '1 pita (60 g)', amount: 1, unit: 'piece', gramsPerUnit: 60 }],
  },
  {
    name: 'Oats, rolled, dry',
    category: 'grains',
    per100g: [389, 16.9, 66, 6.9, 10.6, 0, 2],
    popularity: 88,
    ar: ['شوفان', 'شوفان مجروش'],
    servings: [{ name: '1/2 cup (40 g)', amount: 1, unit: 'serving', gramsPerUnit: 40 }],
  },
  {
    name: 'Pasta, cooked',
    category: 'grains',
    per100g: [131, 5, 25, 1.1, 1.8, 0.6, 6],
    popularity: 78,
    ar: ['مكرونة', 'معكرونة', 'باستا'],
    servings: [{ name: '1 cup (140 g)', amount: 1, unit: 'cup', gramsPerUnit: 140 }],
  },
  {
    name: 'Quinoa, cooked',
    category: 'grains',
    per100g: [120, 4.4, 21, 1.9, 2.8, 0.9, 7],
    popularity: 40,
    ar: ['كينوا'],
  },
  {
    name: 'Bulgur, cooked',
    category: 'grains',
    per100g: [83, 3.1, 19, 0.2, 4.5, 0.1, 5],
    popularity: 45,
    ar: ['برغل'],
  },
  {
    name: 'Couscous, cooked',
    category: 'grains',
    per100g: [112, 3.8, 23, 0.2, 1.4, 0.1, 5],
    popularity: 40,
    ar: ['كسكس', 'كسكسي'],
  },

  // ─── Fruits ──────────────────────────────────────────────
  {
    name: 'Apple, raw',
    category: 'fruits',
    per100g: [52, 0.3, 14, 0.2, 2.4, 10.4, 1],
    popularity: 95,
    ar: ['تفاح', 'تفاحة'],
    servings: [
      { name: '1 medium (182 g)', amount: 1, unit: 'piece', gramsPerUnit: 182, isDefault: true },
    ],
  },
  {
    name: 'Banana, raw',
    category: 'fruits',
    per100g: [89, 1.1, 23, 0.3, 2.6, 12.2, 1],
    popularity: 98,
    ar: ['موز', 'موزة'],
    servings: [
      { name: '1 medium (118 g)', amount: 1, unit: 'piece', gramsPerUnit: 118, isDefault: true },
    ],
  },
  {
    name: 'Orange, raw',
    category: 'fruits',
    per100g: [47, 0.9, 12, 0.1, 2.4, 9.4, 0],
    popularity: 80,
    ar: ['برتقال', 'برتقالة'],
    servings: [{ name: '1 medium (131 g)', amount: 1, unit: 'piece', gramsPerUnit: 131 }],
  },
  {
    name: 'Grapes, raw',
    category: 'fruits',
    per100g: [69, 0.7, 18, 0.2, 0.9, 15.5, 2],
    popularity: 60,
    ar: ['عنب'],
  },
  {
    name: 'Strawberries, raw',
    category: 'fruits',
    per100g: [32, 0.7, 7.7, 0.3, 2, 4.9, 1],
    popularity: 65,
    ar: ['فراولة', 'فريز'],
  },
  {
    name: 'Watermelon, raw',
    category: 'fruits',
    per100g: [30, 0.6, 7.6, 0.2, 0.4, 6.2, 1],
    popularity: 55,
    ar: ['بطيخ', 'حبحب'],
  },
  {
    name: 'Mango, raw',
    category: 'fruits',
    per100g: [60, 0.8, 15, 0.4, 1.6, 13.7, 1],
    popularity: 60,
    ar: ['مانجو', 'مانجا'],
  },
  {
    name: 'Dates, medjool',
    category: 'fruits',
    per100g: [277, 1.8, 75, 0.2, 6.7, 66.5, 1],
    popularity: 75,
    ar: ['تمر', 'بلح', 'رطب'],
    servings: [
      { name: '1 date (24 g)', amount: 1, unit: 'piece', gramsPerUnit: 24, isDefault: true },
    ],
  },
  {
    name: 'Avocado, raw',
    category: 'fruits',
    per100g: [160, 2, 8.5, 14.7, 6.7, 0.7, 7],
    popularity: 55,
    ar: ['أفوكادو'],
    servings: [{ name: '1/2 avocado (100 g)', amount: 1, unit: 'serving', gramsPerUnit: 100 }],
  },

  // ─── Vegetables ──────────────────────────────────────────
  {
    name: 'Potato, boiled',
    category: 'vegetables',
    per100g: [87, 1.9, 20, 0.1, 1.8, 0.9, 4],
    popularity: 80,
    ar: ['بطاطس مسلوقة', 'بطاطس', 'بطاطا'],
  },
  {
    name: 'Sweet potato, baked',
    category: 'vegetables',
    per100g: [90, 2, 21, 0.2, 3.3, 6.5, 36],
    popularity: 60,
    ar: ['بطاطا حلوة'],
  },
  {
    name: 'Tomato, raw',
    category: 'vegetables',
    per100g: [18, 0.9, 3.9, 0.2, 1.2, 2.6, 5],
    popularity: 78,
    ar: ['طماطم', 'بندورة'],
    servings: [{ name: '1 medium (123 g)', amount: 1, unit: 'piece', gramsPerUnit: 123 }],
  },
  {
    name: 'Cucumber, raw',
    category: 'vegetables',
    per100g: [15, 0.7, 3.6, 0.1, 0.5, 1.7, 2],
    popularity: 65,
    ar: ['خيار', 'خيارة'],
  },
  {
    name: 'Carrot, raw',
    category: 'vegetables',
    per100g: [41, 0.9, 10, 0.2, 2.8, 4.7, 69],
    popularity: 60,
    ar: ['جزر', 'جزرة'],
  },
  {
    name: 'Onion, raw',
    category: 'vegetables',
    per100g: [40, 1.1, 9.3, 0.1, 1.7, 4.2, 4],
    popularity: 55,
    ar: ['بصل', 'بصلة'],
  },
  {
    name: 'Spinach, raw',
    category: 'vegetables',
    per100g: [23, 2.9, 3.6, 0.4, 2.2, 0.4, 79],
    popularity: 55,
    ar: ['سبانخ'],
  },
  {
    name: 'Broccoli, raw',
    category: 'vegetables',
    per100g: [34, 2.8, 7, 0.4, 2.6, 1.7, 33],
    popularity: 60,
    ar: ['بروكلي', 'قرنبيط أخضر'],
  },
  {
    name: 'Lettuce, raw',
    category: 'vegetables',
    per100g: [15, 1.4, 2.9, 0.2, 1.3, 0.8, 28],
    popularity: 45,
    ar: ['خس'],
  },
  {
    name: 'Eggplant, cooked',
    category: 'vegetables',
    per100g: [35, 0.8, 8.7, 0.2, 2.5, 3.2, 1],
    popularity: 45,
    ar: ['باذنجان'],
  },

  // ─── Legumes & nuts ──────────────────────────────────────
  {
    name: 'Lentils, cooked',
    category: 'grains',
    per100g: [116, 9, 20, 0.4, 7.9, 1.8, 2],
    popularity: 65,
    ar: ['عدس'],
    servings: [{ name: '1 cup (198 g)', amount: 1, unit: 'cup', gramsPerUnit: 198 }],
  },
  {
    name: 'Chickpeas, cooked',
    category: 'grains',
    per100g: [164, 8.9, 27, 2.6, 7.6, 4.8, 7],
    popularity: 60,
    ar: ['حمص مسلوق', 'حمص'],
  },
  {
    name: 'Fava beans, cooked (ful medames)',
    category: 'grains',
    per100g: [110, 7.6, 19.6, 0.4, 5.4, 1.8, 8],
    popularity: 70,
    ar: ['فول مدمس', 'فول'],
    servings: [{ name: '1 cup (180 g)', amount: 1, unit: 'cup', gramsPerUnit: 180 }],
  },
  {
    name: 'Almonds, raw',
    category: 'snacks',
    per100g: [579, 21, 22, 50, 12.5, 4.4, 1],
    popularity: 65,
    ar: ['لوز'],
    servings: [{ name: '10 almonds (12 g)', amount: 1, unit: 'serving', gramsPerUnit: 12 }],
  },
  {
    name: 'Walnuts, raw',
    category: 'snacks',
    per100g: [654, 15, 14, 65, 6.7, 2.6, 2],
    popularity: 45,
    ar: ['جوز', 'عين جمل'],
  },
  {
    name: 'Peanut butter',
    category: 'snacks',
    per100g: [588, 25, 20, 50, 6, 9.2, 429],
    popularity: 70,
    ar: ['زبدة فول سوداني', 'زبدة فستق'],
    servings: [
      { name: '1 tbsp (16 g)', amount: 1, unit: 'tablespoon', gramsPerUnit: 16, isDefault: true },
    ],
  },

  // ─── Prepared & restaurant ───────────────────────────────
  {
    name: 'Labneh',
    category: 'dairy',
    per100g: [174, 8.6, 6.2, 13, 0, 5.4, 118],
    popularity: 60,
    ar: ['لبنة', 'لبنه'],
    servings: [
      { name: '2 tbsp (30 g)', amount: 2, unit: 'tablespoon', gramsPerUnit: 15, isDefault: true },
      { name: '1 bowl (100 g)', amount: 1, unit: 'serving', gramsPerUnit: 100 },
    ],
  },
  {
    name: 'Hummus',
    category: 'recipes',
    per100g: [166, 7.9, 14.3, 9.6, 6, 0.3, 379],
    popularity: 70,
    ar: ['حمص بالطحينة', 'حمص'],
    servings: [{ name: '2 tbsp (30 g)', amount: 2, unit: 'tablespoon', gramsPerUnit: 15 }],
  },
  {
    name: 'Falafel',
    category: 'recipes',
    per100g: [333, 13.3, 31.8, 17.8, 4.9, 1.8, 294],
    popularity: 75,
    ar: ['فلافل', 'طعمية'],
    servings: [
      { name: '1 piece (17 g)', amount: 1, unit: 'piece', gramsPerUnit: 17, isDefault: true },
    ],
  },
  {
    name: 'Chicken shawarma',
    category: 'restaurant',
    per100g: [195, 17, 8, 11, 0.8, 1.2, 480],
    popularity: 85,
    ar: ['شاورما دجاج', 'شاورما'],
    servings: [
      { name: '1 sandwich (220 g)', amount: 1, unit: 'piece', gramsPerUnit: 220, isDefault: true },
    ],
  },
  {
    name: 'Tabbouleh',
    category: 'recipes',
    per100g: [130, 2.5, 15, 7, 3, 1.5, 260],
    popularity: 50,
    ar: ['تبولة'],
  },
  {
    name: 'Fattoush',
    category: 'recipes',
    per100g: [120, 2.5, 12, 7.2, 2.4, 2.6, 240],
    popularity: 45,
    ar: ['فتوش'],
  },
  {
    name: 'Kabsa, chicken',
    category: 'recipes',
    per100g: [180, 9, 22, 6, 1.2, 1.5, 380],
    popularity: 60,
    ar: ['كبسة دجاج', 'كبسة'],
    servings: [{ name: '1 plate (350 g)', amount: 1, unit: 'serving', gramsPerUnit: 350 }],
  },
  {
    name: 'Mansaf',
    category: 'recipes',
    per100g: [220, 13, 18, 10, 0.9, 1.8, 420],
    popularity: 45,
    ar: ['منسف'],
  },
  {
    name: 'Maqluba',
    category: 'recipes',
    per100g: [165, 6, 22, 6, 1.8, 1.6, 340],
    popularity: 45,
    ar: ['مقلوبة'],
  },
  {
    name: 'Mulukhiyah',
    category: 'recipes',
    per100g: [90, 4.5, 8, 4.5, 2.8, 0.9, 280],
    popularity: 45,
    ar: ['ملوخية'],
  },
  {
    // Sumac chicken on taboon bread. No provider carries it — the kind of dish
    // this seed exists for.
    name: 'Musakhan',
    category: 'recipes',
    per100g: [210, 12, 20, 9.5, 2.1, 1.4, 390],
    popularity: 45,
    ar: ['مسخن'],
    servings: [
      { name: '1 roll (180 g)', amount: 1, unit: 'piece', gramsPerUnit: 180, isDefault: true },
      { name: '1 plate (350 g)', amount: 1, unit: 'serving', gramsPerUnit: 350 },
    ],
  },
  {
    name: 'Shish tawook',
    category: 'restaurant',
    per100g: [185, 24, 3, 8, 0.3, 1.1, 420],
    popularity: 55,
    ar: ['شيش طاووق', 'طاووق'],
    servings: [
      { name: '1 skewer (90 g)', amount: 1, unit: 'piece', gramsPerUnit: 90, isDefault: true },
    ],
  },
  {
    name: 'Kibbeh, fried',
    category: 'recipes',
    per100g: [270, 11, 24, 15, 2.2, 1.1, 350],
    popularity: 40,
    ar: ['كبة', 'كبة مقلية'],
    servings: [
      { name: '1 piece (55 g)', amount: 1, unit: 'piece', gramsPerUnit: 55, isDefault: true },
    ],
  },
  {
    name: 'Foul medames',
    category: 'recipes',
    per100g: [110, 7.6, 16, 1.5, 5.4, 0.6, 310],
    popularity: 60,
    ar: ['فول مدمس', 'فول'],
    servings: [{ name: '1 bowl (250 g)', amount: 1, unit: 'serving', gramsPerUnit: 250 }],
  },
  {
    name: 'Kunafa',
    category: 'snacks',
    per100g: [356, 5.5, 45, 17, 1.1, 28, 190],
    popularity: 65,
    ar: ['كنافة', 'كنافه'],
    servings: [
      { name: '1 piece (100 g)', amount: 1, unit: 'piece', gramsPerUnit: 100, isDefault: true },
    ],
  },
  {
    name: 'Baklava',
    category: 'snacks',
    per100g: [428, 6.1, 45, 25.6, 2.4, 24, 220],
    popularity: 50,
    ar: ['بقلاوة'],
    servings: [{ name: '1 piece (35 g)', amount: 1, unit: 'piece', gramsPerUnit: 35 }],
  },
  {
    name: 'Pizza, cheese',
    category: 'restaurant',
    per100g: [266, 11, 33, 10, 2.3, 3.6, 598],
    popularity: 80,
    ar: ['بيتزا'],
    servings: [
      { name: '1 slice (107 g)', amount: 1, unit: 'slice', gramsPerUnit: 107, isDefault: true },
    ],
  },
  {
    name: 'Cheeseburger',
    category: 'restaurant',
    per100g: [295, 17, 24, 14, 1.4, 5, 497],
    popularity: 75,
    ar: ['برجر بالجبن', 'برجر', 'همبرجر'],
    servings: [{ name: '1 burger (154 g)', amount: 1, unit: 'piece', gramsPerUnit: 154 }],
  },
  {
    name: 'French fries',
    category: 'restaurant',
    per100g: [312, 3.4, 41, 15, 3.8, 0.3, 210],
    popularity: 72,
    ar: ['بطاطس مقلية', 'بطاطا مقلية'],
  },

  // ─── Snacks ──────────────────────────────────────────────
  {
    name: 'Dark chocolate, 70%',
    category: 'snacks',
    per100g: [598, 7.8, 46, 43, 11, 24, 20],
    popularity: 60,
    ar: ['شوكولاتة داكنة', 'شوكولاتة'],
    servings: [{ name: '1 square (10 g)', amount: 1, unit: 'piece', gramsPerUnit: 10 }],
  },
  {
    name: 'Potato chips',
    category: 'snacks',
    per100g: [536, 7, 53, 35, 4.8, 0.2, 525],
    popularity: 55,
    ar: ['شيبس', 'رقائق بطاطس'],
  },
  {
    name: 'Ice cream, vanilla',
    category: 'snacks',
    per100g: [207, 3.5, 24, 11, 0.7, 21, 80],
    popularity: 60,
    ar: ['آيس كريم', 'بوظة'],
  },

  // ─── Drinks ──────────────────────────────────────────────
  {
    name: 'Coffee, black',
    category: 'drinks',
    per100g: [1, 0.1, 0, 0, 0, 0, 2],
    popularity: 95,
    ar: ['قهوة', 'قهوة سادة'],
    servings: [
      { name: '1 cup (240 ml)', amount: 1, unit: 'cup', gramsPerUnit: 240, isDefault: true },
    ],
  },
  {
    name: 'Tea, black, unsweetened',
    category: 'drinks',
    per100g: [1, 0, 0.3, 0, 0, 0, 3],
    popularity: 85,
    ar: ['شاي', 'شاي سادة'],
    servings: [
      { name: '1 cup (240 ml)', amount: 1, unit: 'cup', gramsPerUnit: 240, isDefault: true },
    ],
  },
  {
    // Served in small cups, unsweetened, often with cardamom. Distinct enough
    // from filter coffee — and requested often enough — to be its own entry.
    name: 'Arabic coffee',
    category: 'drinks',
    per100g: [3, 0.2, 0.5, 0, 0, 0, 5],
    popularity: 70,
    ar: ['قهوة عربية', 'قهوة سادة', 'قهوه عربيه'],
    servings: [
      { name: '1 finjan (60 ml)', amount: 1, unit: 'cup', gramsPerUnit: 60, isDefault: true },
    ],
  },
  {
    name: 'Turkish coffee, with sugar',
    category: 'drinks',
    per100g: [22, 0.2, 5.4, 0, 0, 5, 5],
    popularity: 55,
    ar: ['قهوة تركية', 'قهوة بالسكر'],
    servings: [
      { name: '1 cup (75 ml)', amount: 1, unit: 'cup', gramsPerUnit: 75, isDefault: true },
    ],
  },
  {
    name: 'Orange juice',
    category: 'drinks',
    per100g: [45, 0.7, 10.4, 0.2, 0.2, 8.4, 1],
    popularity: 65,
    ar: ['عصير برتقال', 'عصير'],
    servings: [{ name: '1 cup (248 ml)', amount: 1, unit: 'cup', gramsPerUnit: 248 }],
  },
  {
    name: 'Cola, regular',
    category: 'drinks',
    per100g: [42, 0, 10.6, 0, 0, 10.6, 4],
    popularity: 60,
    ar: ['كولا', 'مشروب غازي'],
    servings: [{ name: '1 can (330 ml)', amount: 1, unit: 'piece', gramsPerUnit: 330 }],
  },
  {
    name: 'Water',
    category: 'drinks',
    per100g: [0, 0, 0, 0, 0, 0, 0],
    popularity: 70,
    ar: ['ماء', 'مويه', 'مي'],
    servings: [
      { name: '1 glass (250 ml)', amount: 1, unit: 'cup', gramsPerUnit: 250, isDefault: true },
    ],
  },

  // ─── Supplements & extras ────────────────────────────────
  {
    name: 'Whey protein powder',
    category: 'supplements',
    per100g: [400, 80, 8, 5, 1, 4, 300],
    popularity: 80,
    ar: ['بروتين واي', 'مسحوق بروتين', 'بروتين'],
    servings: [
      { name: '1 scoop (30 g)', amount: 1, unit: 'serving', gramsPerUnit: 30, isDefault: true },
    ],
  },
  {
    name: 'Olive oil',
    category: 'other',
    per100g: [884, 0, 0, 100, 0, 0, 2],
    popularity: 60,
    ar: ['زيت زيتون', 'زيت'],
    servings: [
      { name: '1 tbsp (13.5 g)', amount: 1, unit: 'tablespoon', gramsPerUnit: 13.5, isDefault: true },
    ],
  },
  {
    name: 'Honey',
    category: 'other',
    per100g: [304, 0.3, 82, 0, 0.2, 82, 4],
    popularity: 55,
    ar: ['عسل'],
    servings: [{ name: '1 tbsp (21 g)', amount: 1, unit: 'tablespoon', gramsPerUnit: 21 }],
  },
  {
    name: 'Sugar, white',
    category: 'other',
    per100g: [387, 0, 100, 0, 0, 100, 1],
    popularity: 50,
    ar: ['سكر'],
    servings: [{ name: '1 tsp (4 g)', amount: 1, unit: 'teaspoon', gramsPerUnit: 4 }],
  },
];

/**
 * Insert the catalogue, skipping anything already present.
 *
 * Idempotent on the food's normalised name, so re-running tops the table up
 * rather than duplicating it. Translations and servings are only written
 * alongside a newly created food — editing an existing row is a migration's job,
 * not a seed's.
 */
export async function seedFoods(
  db: NodePgDatabase<typeof schema>,
): Promise<{ foods: number; translations: number; servings: number }> {
  const counts = { foods: 0, translations: 0, servings: 0 };

  for (const food of FOODS) {
    const searchName = normalize(food.name);

    const existing = await db.query.foods.findFirst({
      where: and(eq(schema.foods.searchName, searchName), eq(schema.foods.source, 'local')),
    });
    if (existing) continue;

    const [calories, protein, carbs, fat, fiber = 0, sugar = 0, sodium = 0] = food.per100g;

    // Seeded names are already written for a reader, so normalisation is only
    // consulted for the icon, group and keywords — the display name stays as
    // authored rather than being re-derived from itself.
    const readable = normalizeFood({ name: food.name, category: food.category });

    const [created] = await db
      .insert(schema.foods)
      .values({
        name: food.name,
        searchName,
        category: food.category,
        kind: 'generic',
        source: 'local',
        displayName: food.name,
        shortName: readable.shortName,
        // The Arabic names are searchable through `food_translations`; keywords
        // carry the English aliases the normaliser knows about.
        keywords: readable.keywords,
        searchKeywords: keywordsToSearchBlob(readable.keywords),
        emoji: readable.emoji,
        groupKey: readable.groupKey,
        normalized: true,
        calories,
        protein,
        carbs,
        fat,
        fiber,
        sugar,
        sodium,
        popularity: food.popularity,
        // Curated by hand, so trusted for ranking and category browsing.
        verified: true,
      })
      .returning();
    counts.foods += 1;

    // English is the canonical name; store it as a translation too so a search
    // in any language hits exactly one code path.
    const translations = [
      { language: 'en', translatedName: food.name, isPrimary: true },
      ...food.ar.map((name, index) => ({
        language: 'ar',
        translatedName: name,
        // The first Arabic name is what gets displayed; the rest are aliases
        // that only need to be findable.
        isPrimary: index === 0,
      })),
    ];

    for (const translation of translations) {
      const translationSearchName = normalize(translation.translatedName);
      if (!translationSearchName) continue;

      const inserted = await db
        .insert(schema.foodTranslations)
        .values({
          foodId: created.id,
          language: translation.language,
          translatedName: translation.translatedName,
          searchName: translationSearchName,
          isPrimary: translation.isPrimary,
        })
        // Two aliases can normalise to the same string ("كنافة"/"كنافه"); the
        // unique index catches it and the duplicate is simply skipped.
        .onConflictDoNothing()
        .returning();

      counts.translations += inserted.length;
    }

    for (const serving of food.servings ?? []) {
      await db.insert(schema.foodServings).values({
        foodId: created.id,
        servingName: serving.name,
        amount: serving.amount,
        unit: serving.unit,
        gramsPerUnit: serving.gramsPerUnit,
        isDefault: serving.isDefault ?? false,
      });
      counts.servings += 1;
    }
  }

  return counts;
}
