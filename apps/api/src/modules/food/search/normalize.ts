/**
 * Query and name normalisation.
 *
 * Everything written to a `search_name` column and every incoming query passes
 * through `normalize`, so the two are always compared on the same footing. If
 * this function changes, `search_name` has to be rebuilt — it is a stored
 * projection, not a view.
 */

/**
 * Every combining mark, in any script.
 *
 * After NFKD this covers Latin accents *and* Arabic tashkeel *and* the hamza
 * that `أ`/`إ`/`آ`/`ؤ`/`ئ` decompose into. Matching only the Latin range
 * (U+0300–U+036F) leaves the Arabic hamza behind, and since a combining mark is
 * neither a letter nor a digit it would then be replaced by a space — silently
 * splitting "أرز" into "ا رز" and breaking every Arabic lookup.
 */
const COMBINING_MARKS = /\p{M}+/gu;

/** Tatweel is a letter-category elongation mark, so marks-stripping misses it. */
const TATWEEL = /ـ/g;

/**
 * Orthographic variants that Arabic speakers type interchangeably. Without this
 * folding, "دجاج" typed with a hamza-less alef misses an entry stored with one,
 * which reads to the user as the search being broken.
 */
const ARABIC_FOLDINGS: [RegExp, string][] = [
  [/[آأإٱ]/g, 'ا'], // آ أ إ ٱ -> ا
  [/ى/g, 'ي'], // ى -> ي
  [/ة/g, 'ه'], // ة -> ه
  [/[ؤ]/g, 'و'], // ؤ -> و
  [/[ئ]/g, 'ي'], // ئ -> ي
];

/** Arabic-Indic and Eastern Arabic-Indic digits -> ASCII. */
const digitOffsets = [
  { start: 0x0660, base: 0 }, // ٠-٩
  { start: 0x06f0, base: 0 }, // ۰-۹
];

const foldDigits = (value: string): string =>
  value.replace(/[٠-٩۰-۹]/g, (char) => {
    const code = char.charCodeAt(0);
    for (const { start } of digitOffsets) {
      if (code >= start && code <= start + 9) return String(code - start);
    }
    return char;
  });

/**
 * Fold a name or query to its comparable form: lowercase, unaccented,
 * Arabic-normalised, punctuation collapsed to single spaces.
 *
 * "Café Latté" -> "cafe latte"; "أُرْز" -> "ارز"; "Chicken, breast (raw)" ->
 * "chicken breast raw".
 */
export const normalize = (value: string): string => {
  // NFKD splits accented and hamza-bearing letters into base + mark, so a single
  // mark-strip then handles Latin accents and Arabic diacritics alike.
  let result = value.normalize('NFKD').replace(COMBINING_MARKS, '').replace(TATWEEL, '');

  for (const [pattern, replacement] of ARABIC_FOLDINGS) {
    result = result.replace(pattern, replacement);
  }

  result = foldDigits(result).toLowerCase();

  // Keep letters (any script) and digits; everything else becomes a separator.
  result = result.replace(/[^\p{L}\p{N}]+/gu, ' ');

  return result.trim().replace(/\s+/g, ' ');
};

/** Normalised, non-empty whitespace-separated tokens. */
export const tokenize = (value: string): string[] =>
  normalize(value).split(' ').filter(Boolean);

/**
 * Which script a query is written in. Used to pick the language a result should
 * be displayed in, and to decide whether the query needs translating before it
 * can be sent to the English-only external providers.
 */
export const detectLanguage = (value: string): string => {
  if (/[؀-ۿ]/.test(value)) return 'ar';
  return 'en';
};

/**
 * Escape a value for use inside a SQL `LIKE`/`ILIKE` pattern. Without this a
 * user typing "100%" turns the literal into a wildcard.
 */
export const escapeLike = (value: string): string =>
  value.replace(/[\\%_]/g, (char) => `\\${char}`);
