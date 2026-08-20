import { normalize } from './normalize';

/**
 * Query-side translation.
 *
 * `food_translations` handles the *result* side — showing a food under the name
 * the user reads. This handles the *input* side: turning whatever the user typed
 * into English terms the external providers (which are English-only) can answer.
 *
 * Kept as a static map rather than a database table on purpose. It is consulted
 * on every keystroke and is small, uniform and slow-changing; a table would add
 * a round trip to the hot path for data that ships fine with the code. Foods
 * themselves are never duplicated per language — only these query terms are.
 */

/** Foreign term -> English terms it should also search for. */
const TRANSLATIONS: Record<string, string[]> = {
  // ── Arabic: poultry, meat, fish ──
  دجاج: ['chicken'],
  فراخ: ['chicken'],
  'صدور دجاج': ['chicken breast'],
  'صدر دجاج': ['chicken breast'],
  لحم: ['beef', 'meat'],
  'لحم بقري': ['beef'],
  بقر: ['beef'],
  خروف: ['lamb'],
  'لحم ضاني': ['lamb'],
  ديك: ['turkey'],
  'ديك رومي': ['turkey'],
  كبده: ['liver'],
  سمك: ['fish'],
  سلمون: ['salmon'],
  تونه: ['tuna'],
  جمبري: ['shrimp'],
  روبيان: ['shrimp'],

  // ── Arabic: grains, staples ──
  ارز: ['rice'],
  رز: ['rice'],
  خبز: ['bread'],
  عيش: ['bread'],
  توست: ['toast'],
  مكرونه: ['pasta'],
  معكرونه: ['pasta'],
  شوفان: ['oats'],
  برغل: ['bulgur'],
  فريك: ['freekeh'],
  كسكس: ['couscous'],
  دقيق: ['flour'],

  // ── Arabic: dairy & eggs ──
  بيض: ['egg'],
  حليب: ['milk'],
  لبن: ['milk', 'yogurt'],
  زبادي: ['yogurt'],
  جبن: ['cheese'],
  جبنه: ['cheese'],
  زبده: ['butter'],
  قشطه: ['cream'],

  // ── Arabic: produce ──
  تفاح: ['apple'],
  موز: ['banana'],
  برتقال: ['orange'],
  عنب: ['grapes'],
  فراوله: ['strawberry'],
  بطيخ: ['watermelon'],
  مانجو: ['mango'],
  تمر: ['dates'],
  بلح: ['dates'],
  طماطم: ['tomato'],
  بندوره: ['tomato'],
  بطاطس: ['potato'],
  بطاطا: ['potato', 'sweet potato'],
  خيار: ['cucumber'],
  جزر: ['carrot'],
  بصل: ['onion'],
  ثوم: ['garlic'],
  سبانخ: ['spinach'],
  خس: ['lettuce'],
  باذنجان: ['eggplant'],
  فلفل: ['pepper'],
  كوسه: ['zucchini'],

  // ── Arabic: legumes & nuts ──
  عدس: ['lentils'],
  فول: ['fava beans', 'beans'],
  حمص: ['chickpeas', 'hummus'],
  لوز: ['almonds'],
  جوز: ['walnuts'],
  فستق: ['pistachio'],
  'زبده فول سوداني': ['peanut butter'],

  // ── Arabic: prepared dishes ──
  كنافه: ['kunafa', 'knafeh'],
  بقلاوه: ['baklava'],
  شاورما: ['shawarma'],
  فلافل: ['falafel'],
  طعميه: ['falafel'],
  كبسه: ['kabsa'],
  منسف: ['mansaf'],
  مقلوبه: ['maqluba'],
  مسخن: ['musakhan'],
  ملوخيه: ['mulukhiyah'],
  لبنه: ['labneh'],
  كبه: ['kibbeh'],
  طاووق: ['shish tawook'],
  'شيش طاووق': ['shish tawook'],
  'فول مدمس': ['foul medames', 'fava beans'],
  'قهوه عربيه': ['arabic coffee'],
  'قهوه تركيه': ['turkish coffee'],
  محشي: ['stuffed vegetables', 'dolma'],
  شوربه: ['soup'],
  سلطه: ['salad'],
  تبوله: ['tabbouleh'],
  فتوش: ['fattoush'],
  بيتزا: ['pizza'],
  برجر: ['burger'],
  سندويش: ['sandwich'],
  ساندويتش: ['sandwich'],

  // ── Arabic: drinks & extras ──
  قهوه: ['coffee'],
  شاي: ['tea'],
  عصير: ['juice'],
  ماء: ['water'],
  مويه: ['water'],
  سكر: ['sugar'],
  عسل: ['honey'],
  زيت: ['oil'],
  'زيت زيتون': ['olive oil'],
  ملح: ['salt'],
  شوكولاته: ['chocolate'],
  ايس: ['ice cream'],
  بروتين: ['protein powder', 'whey protein'],
  مكمل: ['supplement'],
};

/**
 * English terms that mean the same thing. Bidirectional: each group's members
 * all expand to every other member, so "aubergine" finds "eggplant" whichever
 * side the catalogue happens to store.
 */
const SYNONYM_GROUPS: string[][] = [
  ['eggplant', 'aubergine'],
  ['zucchini', 'courgette'],
  ['cilantro', 'coriander'],
  ['chickpeas', 'garbanzo beans'],
  ['shrimp', 'prawns'],
  ['yogurt', 'yoghurt'],
  ['soda', 'soft drink', 'pop'],
  ['fries', 'chips', 'french fries'],
  ['ground beef', 'minced beef', 'mince'],
  ['maize', 'corn'],
  ['kunafa', 'knafeh', 'kanafeh'],
  ['shawarma', 'shawurma', 'schawarma'],
  ['musakhan', 'msakhan', 'musakkhan'],
  ['labneh', 'labaneh', 'labne'],
  ['kibbeh', 'kibbe', 'kubba'],
  ['shish tawook', 'shish taouk', 'tawook'],
  ['foul medames', 'ful medames', 'foul'],
  ['maqluba', 'maqlooba', 'makloubeh'],
  ['mansaf', 'mansef'],
  ['arabic coffee', 'qahwa'],
  ['whey protein', 'protein powder', 'protein shake'],
  ['soda water', 'sparkling water'],
  ['aubergine', 'brinjal'],
];

/** Normalised lookup built once at module load. */
const lookup = new Map<string, string[]>();

const addEntry = (key: string, values: string[]) => {
  const normalizedKey = normalize(key);
  if (!normalizedKey) return;

  const existing = lookup.get(normalizedKey) ?? [];
  const merged = new Set(existing);
  for (const value of values) {
    const normalizedValue = normalize(value);
    // A term never needs to expand to itself.
    if (normalizedValue && normalizedValue !== normalizedKey) merged.add(normalizedValue);
  }
  if (merged.size > 0) lookup.set(normalizedKey, [...merged]);
};

for (const [term, translations] of Object.entries(TRANSLATIONS)) {
  addEntry(term, translations);
}

for (const group of SYNONYM_GROUPS) {
  for (const term of group) {
    addEntry(term, group);
  }
}

/**
 * Alternative phrasings of a query, English-first.
 *
 * Tries the whole phrase before its parts, so "صدور دجاج" resolves to the
 * specific "chicken breast" rather than the generic "chicken" it would get from
 * word-by-word expansion. Word-level expansion still runs afterwards to catch
 * mixed-language input like "دجاج grilled".
 *
 * Returns only the *alternatives*; the caller always searches the original too.
 */
export const expandQuery = (query: string): string[] => {
  const normalized = normalize(query);
  if (!normalized) return [];

  const variants = new Set<string>();

  // 1. Whole-phrase match — the most specific translation available.
  for (const phrase of lookup.get(normalized) ?? []) {
    variants.add(phrase);
  }

  // 2. Word-level substitution, rebuilding the phrase around each replacement.
  const words = normalized.split(' ');
  if (words.length > 1) {
    words.forEach((word, index) => {
      for (const replacement of lookup.get(word) ?? []) {
        const rebuilt = [...words];
        rebuilt[index] = replacement;
        variants.add(rebuilt.join(' '));
      }
    });
  }

  variants.delete(normalized);
  return [...variants];
};

/**
 * The single best English phrasing to send to an external provider, or null when
 * the query is already usable as-is.
 */
export const toProviderQuery = (query: string): string | null => {
  const normalized = normalize(query);
  if (!normalized) return null;

  // Latin-script queries already suit the providers.
  if (!/[؀-ۿ]/.test(normalized)) return null;

  const [best] = expandQuery(normalized).filter((variant) => !/[؀-ۿ]/.test(variant));
  return best ?? null;
};
