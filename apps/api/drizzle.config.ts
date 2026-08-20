import 'dotenv/config';
import { defineConfig } from 'drizzle-kit';

// Without loading .env, drizzle-kit silently falls back to the default URL below
// and would run migrations against the wrong database.
export default defineConfig({
  dialect: 'postgresql',
  schema: './src/database/schema/index.ts',
  out: './src/database/migrations',
  dbCredentials: {
    url: process.env.DATABASE_URL || 'postgres://postgres:postgres@localhost:5432/fitforge',
  },
  verbose: true,
  strict: true,
});
