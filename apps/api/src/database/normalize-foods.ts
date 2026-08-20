import 'dotenv/config';
import { Pool } from 'pg';
import { drizzle } from 'drizzle-orm/node-postgres';
import { asc, eq, gt, inArray } from 'drizzle-orm';
import * as schema from './schema';
import {
  keywordsToSearchBlob,
  normalizeFood,
} from '../modules/food/normalization/food-normalizer';
import { tidyServingLabel } from '../modules/food/search/servings';

/**
 * Backfills the normalisation columns over foods that predate them.
 *
 * New foods are normalised as they are written, so this only exists for rows
 * already in the catalogue when the layer shipped — and for re-running after the
 * rules change, since improving a canonical rule should improve foods already
 * stored under it.
 *
 * Idempotent and resumable. Work is claimed in batches by `normalized = false`,
 * so an interrupted run simply picks up where it stopped, and a completed run
 * finds nothing to do. Pass `--all` to re-normalise everything, which also
 * sweeps the names of portions already recorded — a plain run leaves them be,
 * since no per-serving marker exists to make that sweep cheap.
 */

const BATCH_SIZE = 500;

async function main() {
  if (!process.env.DATABASE_URL) {
    throw new Error('DATABASE_URL is not set. Run this from apps/api with a configured .env.');
  }

  const all = process.argv.includes('--all');
  const pool = new Pool({ connectionString: process.env.DATABASE_URL });
  const db = drizzle(pool, { schema });

  let processed = 0;
  let servingsAdded = 0;
  let servingsRepaired = 0;

  try {
    if (all) {
      // Re-open every row for reprocessing; the loop below then drains it.
      const reset = await db
        .update(schema.foods)
        .set({ normalized: false })
        .returning({ id: schema.foods.id });
      console.log(`Re-normalising all ${reset.length} foods.`);
    }

    for (;;) {
      const batch = await db
        .select()
        .from(schema.foods)
        .where(eq(schema.foods.normalized, false))
        .limit(BATCH_SIZE);

      if (batch.length === 0) break;

      for (const food of batch) {
        const readable = normalizeFood({
          name: food.name,
          brand: food.brand,
          category: food.category,
          servingGrams: food.servingGrams,
          servingLabel: food.servingLabel,
        });

        await db
          .update(schema.foods)
          .set({
            // A curated or user-written name already reads well; only fill the
            // display name where the provider's wording would otherwise show.
            displayName: readable.displayName,
            shortName: readable.shortName,
            keywords: readable.keywords,
            searchKeywords: keywordsToSearchBlob(readable.keywords),
            emoji: readable.emoji,
            groupKey: readable.groupKey,
            normalized: true,
            updatedAt: new Date(),
          })
          .where(eq(schema.foods.id, food.id));

        processed += 1;
      }

      // Give portions to any food in this batch that still has none. A food
      // offering only "100 g" is the database feel this layer exists to remove.
      servingsAdded += await addMissingServings(db, batch);

      console.log(`  normalised ${processed} foods…`);
    }

    // A food that already had portions never reaches the insert above, so this
    // is the only pass that can bring its recorded names up to the rules.
    if (all) servingsRepaired = await repairServingNames(db);

    console.log('Normalisation complete:');
    console.log(`  foods normalised:   ${processed}`);
    console.log(`  servings added:     ${servingsAdded}`);
    console.log(`  servings repaired:  ${servingsRepaired}`);
  } finally {
    await pool.end();
  }
}

/** Insert suggested portions for foods that have none, and report how many. */
async function addMissingServings(
  db: ReturnType<typeof drizzle<typeof schema>>,
  foods: (typeof schema.foods.$inferSelect)[],
): Promise<number> {
  const ids = foods.map((food) => food.id);
  if (ids.length === 0) return 0;

  const existing = await db
    .selectDistinct({ foodId: schema.foodServings.foodId })
    .from(schema.foodServings)
    .where(inArray(schema.foodServings.foodId, ids));

  const covered = new Set(existing.map((row) => row.foodId));

  const values = foods
    .filter((food) => !covered.has(food.id))
    .flatMap((food) =>
      normalizeFood({
        name: food.name,
        brand: food.brand,
        category: food.category,
        servingGrams: food.servingGrams,
        servingLabel: food.servingLabel,
      }).servings.map((serving, index) => ({
        foodId: food.id,
        servingName: serving.name.slice(0, 120),
        amount: serving.amount,
        unit: serving.unit,
        gramsPerUnit: serving.gramsPerUnit,
        isDefault: serving.isDefault ?? index === 0,
      })),
    );

  if (values.length === 0) return 0;

  await db.insert(schema.foodServings).values(values);
  return values.length;
}

/**
 * Put recorded portion names through the same tidier new writes go through.
 *
 * Portions stored before that tidier existed still hold the provider's shouted
 * free text — "8 ONZ", "1 CONTAINER" — and the picker renders a recorded name
 * verbatim, so rewriting the row is the only thing that gets it off the user's
 * screen. Only the label moves: the weights are measured data and stay as they
 * are, which is also why a portion's own grams have to be handed to the tidier
 * rather than the per-unit conversion.
 *
 * Walked by `id` in batches instead of loaded whole, and an already-tidy name
 * tidies to itself, so an interrupted run is simply started again.
 */
async function repairServingNames(db: ReturnType<typeof drizzle<typeof schema>>): Promise<number> {
  let cursor = '00000000-0000-0000-0000-000000000000';
  let scanned = 0;
  let repaired = 0;

  for (;;) {
    const batch = await db
      .select()
      .from(schema.foodServings)
      .where(gt(schema.foodServings.id, cursor))
      .orderBy(asc(schema.foodServings.id))
      .limit(BATCH_SIZE);

    if (batch.length === 0) break;
    cursor = batch[batch.length - 1].id;
    scanned += batch.length;

    for (const serving of batch) {
      const tidied = tidyServingLabel(
        serving.servingName,
        serving.amount * serving.gramsPerUnit,
      ).slice(0, 120);

      // Writing a name back as itself would churn every row on every full run.
      if (tidied === serving.servingName) continue;

      await db
        .update(schema.foodServings)
        .set({ servingName: tidied })
        .where(eq(schema.foodServings.id, serving.id));

      repaired += 1;
    }

    console.log(`  checked ${scanned} servings, repaired ${repaired}…`);
  }

  return repaired;
}

main().catch((error) => {
  console.error('Normalisation failed:', error);
  process.exit(1);
});
