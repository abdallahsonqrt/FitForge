import { describe, expect, it } from 'vitest';
import { detectLanguage, escapeLike, normalize, tokenize } from './normalize';
import { expandQuery, toProviderQuery } from './lexicon';
import { scoreCandidate, dedupeKey, Scorable } from './ranking';
import { buildServingOptions, toGrams, gramsPerUnit, isMeasuredUnit } from './servings';

/**
 * These cover the parts of search that decide *which* food a person meant —
 * normalisation, translation and ranking. They are pure functions, so the
 * behaviour that is hardest to eyeball is also the cheapest to pin down.
 */

describe('normalize', () => {
  it('strips Latin accents and punctuation', () => {
    expect(normalize('Café Latté')).toBe('cafe latte');
    expect(normalize('Chicken, breast (raw)')).toBe('chicken breast raw');
  });

  it('removes Arabic diacritics', () => {
    expect(normalize('أُرْز')).toBe('ارز');
  });

  it('folds Arabic orthographic variants so spelling choices still match', () => {
    // ة/ه and the alef family are typed interchangeably.
    expect(normalize('كنافة')).toBe(normalize('كنافه'));
    expect(normalize('إأآا')).toBe('اااا');
    expect(normalize('مصطفى')).toBe(normalize('مصطفي'));
  });

  it('folds Arabic-Indic digits to ASCII', () => {
    expect(normalize('١٠٠')).toBe('100');
  });

  it('collapses whitespace', () => {
    expect(normalize('  chicken   breast  ')).toBe('chicken breast');
    expect(tokenize('chicken, breast')).toEqual(['chicken', 'breast']);
  });

  it('detects the query script', () => {
    expect(detectLanguage('دجاج')).toBe('ar');
    expect(detectLanguage('chicken')).toBe('en');
  });

  it('escapes LIKE wildcards so "100%" is not a pattern', () => {
    expect(escapeLike('100%_x')).toBe('100\\%\\_x');
  });
});

describe('lexicon', () => {
  it('translates Arabic query terms to English', () => {
    expect(expandQuery('دجاج')).toContain('chicken');
    expect(expandQuery('أرز')).toContain('rice');
    expect(expandQuery('كنافة')).toContain('kunafa');
  });

  it('prefers a whole-phrase translation over word-by-word', () => {
    // Not merely "chicken", which is what word-level expansion alone would give.
    expect(expandQuery('صدور دجاج')).toContain('chicken breast');
  });

  it('expands synonyms in both directions', () => {
    expect(expandQuery('aubergine')).toContain('eggplant');
    expect(expandQuery('eggplant')).toContain('aubergine');
  });

  it('handles mixed-language input', () => {
    expect(expandQuery('دجاج grilled')).toContain('chicken grilled');
  });

  it('never expands a term to itself', () => {
    expect(expandQuery('chicken')).not.toContain('chicken');
  });

  it('only rewrites provider queries that need it', () => {
    expect(toProviderQuery('دجاج')).toBe('chicken');
    // Latin script already suits the providers.
    expect(toProviderQuery('chicken')).toBeNull();
  });
});

describe('scoreCandidate', () => {
  const candidate = (searchName: string, extra: Partial<Scorable> = {}): Scorable => ({
    searchName,
    kind: 'generic',
    popularity: 0,
    verified: false,
    similarity: 0.5,
    ...extra,
  });

  const best = (query: string, names: string[]) =>
    names
      .map((name) => ({ name, score: scoreCandidate(query, candidate(name)) }))
      .sort((a, b) => b.score - a.score)[0].name;

  it('ranks a food the query is about over one that merely mentions it', () => {
    expect(best('egg', ['bagels egg', 'potato salad with egg', 'egg whole raw'])).toBe(
      'egg whole raw',
    );
  });

  it('prefers the concise name when both match every token', () => {
    expect(
      best('chicken breast', [
        'chicken breast rotisserie skin removed refrigerated sliced',
        'chicken breast',
      ]),
    ).toBe('chicken breast');
  });

  it('matches a prefix against any word in the name', () => {
    expect(scoreCandidate('chi', candidate('chicken breast'))).toBeGreaterThan(
      scoreCandidate('chi', candidate('sweet chilli sauce')),
    );
  });

  it('does not let popularity beat an exact name match', () => {
    expect(scoreCandidate('rice', candidate('rice'))).toBeGreaterThan(
      scoreCandidate('rice', candidate('rice pudding', { popularity: 500 })),
    );
  });

  it('breaks ties toward generic and verified entries', () => {
    expect(scoreCandidate('milk', candidate('milk'))).toBeGreaterThan(
      scoreCandidate('milk', candidate('milk', { kind: 'branded' })),
    );
    expect(scoreCandidate('milk', candidate('milk', { verified: true }))).toBeGreaterThan(
      scoreCandidate('milk', candidate('milk')),
    );
  });

  it('gives partial credit when only some tokens match', () => {
    const partial = scoreCandidate('grilled chicken breast', candidate('chicken breast'));
    expect(partial).toBeGreaterThan(0);
    expect(partial).toBeLessThan(scoreCandidate('chicken breast', candidate('chicken breast')));
  });

  it('stays within 0 and 1', () => {
    const strongest = scoreCandidate(
      'rice',
      candidate('rice', { similarity: 1, popularity: 10_000, verified: true }),
    );
    expect(strongest).toBeGreaterThan(0);
    expect(strongest).toBeLessThanOrEqual(1);
  });

  it('collapses names that differ only in punctuation', () => {
    expect(dedupeKey('Chicken, breast', null)).toBe(dedupeKey('Chicken breast', null));
    // A brand is part of the identity, so it must still separate two entries.
    expect(dedupeKey('Yogurt', 'Chobani')).not.toBe(dedupeKey('Yogurt', 'Fage'));
  });
});

describe('servings', () => {
  it('treats measured units as fixed conversions', () => {
    expect(toGrams(250, 'g', 'grains')).toBe(250);
    expect(toGrams(1.5, 'kg', 'meat')).toBe(1500);
    // A stale per-food value must never override a definitional unit.
    expect(toGrams(1, 'g', 'dairy', 999)).toBe(1);
  });

  it('prefers a food’s own conversion for counted units', () => {
    expect(toGrams(1, 'cup', 'grains', 158)).toBe(158);
  });

  it('falls back to a category-appropriate weight', () => {
    // A cup of milk is not a cup of rice.
    expect(gramsPerUnit('cup', 'dairy')).not.toBe(gramsPerUnit('cup', 'grains'));
    expect(toGrams(1, 'cup', 'dairy')).toBe(245);
  });

  it('lists recorded portions first and does not duplicate their unit', () => {
    const options = buildServingOptions(
      'meat',
      [
        {
          id: 'a',
          servingName: '1 breast (172 g)',
          amount: 1,
          unit: 'piece',
          gramsPerUnit: 172,
          isDefault: true,
        },
      ],
      null,
      null,
    );

    expect(options[0].name).toBe('1 breast (172 g)');
    expect(options[0].grams).toBe(172);
    expect(options.filter((option) => option.unit === 'piece')).toHaveLength(1);
    // Grams must always remain available.
    expect(options.some((option) => option.unit === 'g')).toBe(true);
  });

  it('promotes a provider-stated serving to the default', () => {
    const options = buildServingOptions('snacks', [], 35, '1 piece');
    expect(options[0].isDefault).toBe(true);
    expect(options[0].grams).toBe(35);
  });

  it('always yields exactly one default, even with no recorded portions', () => {
    for (const options of [
      buildServingOptions('drinks', [], null, null),
      buildServingOptions('snacks', [], 35, '1 piece'),
    ]) {
      expect(options.length).toBeGreaterThan(0);
      expect(options.filter((option) => option.isDefault)).toHaveLength(1);
    }
  });
});

describe('servings — volume density', () => {
  it('lets a density measured for the food override the water assumption', () => {
    // Olive oil is ~0.92 g/ml. Storing that and then ignoring it overstated
    // every millilitre by 8%.
    expect(gramsPerUnit('ml', 'other', 0.92)).toBe(0.92);
    expect(toGrams(15, 'ml', 'other', 0.92)).toBe(13.8);
    expect(gramsPerUnit('l', 'drinks', 1420)).toBe(1420);
  });

  it('falls back to water density when nothing was measured', () => {
    expect(gramsPerUnit('ml', 'drinks')).toBe(1);
    expect(gramsPerUnit('l', 'drinks')).toBe(1000);
  });

  it('never lets a recorded value contradict a mass unit', () => {
    // A kilogram is a thousand grams of anything; bad data must not win.
    expect(gramsPerUnit('g', 'other', 999)).toBe(1);
    expect(gramsPerUnit('kg', 'other', 5)).toBe(1000);
  });

  it('still treats volume units as measured', () => {
    for (const unit of ['g', 'kg', 'ml', 'l'] as const) {
      expect(isMeasuredUnit(unit)).toBe(true);
    }
    expect(isMeasuredUnit('cup')).toBe(false);
  });
});
