import 'dotenv/config';
import { Pool } from 'pg';
import { drizzle } from 'drizzle-orm/node-postgres';
import { migrate } from 'drizzle-orm/node-postgres/migrator';

/**
 * Applies the SQL migrations in `src/database/migrations`.
 *
 * This is the only correct way to build this database — `drizzle-kit push` is
 * not. Parts of the schema cannot be expressed in the Drizzle DSL and therefore
 * exist solely in the migration SQL:
 *
 *   - the `pg_trgm` extension;
 *   - the GIN/`gin_trgm_ops` indexes behind fuzzy search and autocomplete;
 *   - the generated `search_vector` tsvector columns on `foods` and
 *     `food_translations`, and their GIN indexes.
 *
 * `push` syncs the live database to the TypeScript schema, so it would create a
 * database missing all of the above — and food search queries reference
 * `search_vector` by name, so they would fail immediately. Run this instead.
 *
 * Idempotent: drizzle records applied migrations in `__drizzle_migrations` and
 * skips them on a later run.
 */
async function main() {
  if (!process.env.DATABASE_URL) {
    throw new Error('DATABASE_URL is not set. Run this from apps/api with a configured .env.');
  }

  const pool = new Pool({ connectionString: process.env.DATABASE_URL });
  const db = drizzle(pool);

  try {
    console.log('Applying migrations…');
    await migrate(db, { migrationsFolder: './src/database/migrations' });
    console.log('Migrations applied.');
  } finally {
    await pool.end();
  }
}

main().catch((error) => {
  console.error('Migration failed:', error);
  process.exit(1);
});
