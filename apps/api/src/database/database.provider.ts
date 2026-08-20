import { Provider } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { drizzle } from 'drizzle-orm/node-postgres';
import { Pool } from 'pg';
import * as schema from './schema';

export const DB_CONNECTION = 'DB_CONNECTION';

/**
 * How close a query has to be to a word in a food's name to count as a match.
 *
 * pg_trgm's default is 0.6, which rejects ordinary typing: "chikcen" scores
 * 0.375 against "chicken". 0.35 admits a transposed or dropped letter while
 * still excluding unrelated words — below about 0.3, short queries start
 * dragging in noise.
 *
 * Set per connection rather than with `ALTER DATABASE` so the behaviour travels
 * with the application. A database configured by someone else, or restored
 * elsewhere, still searches identically.
 */
const WORD_SIMILARITY_THRESHOLD = 0.35;

export const databaseProvider: Provider = {
  provide: DB_CONNECTION,
  inject: [ConfigService],
  useFactory: async (configService: ConfigService) => {
    const connectionString = configService.get<string>('DATABASE_URL');

    const pool = new Pool({
      connectionString,
      // Applied by the server during connection startup rather than by a `SET`
      // afterwards. The GUC is per session, so every pooled connection needs it
      // — and issuing the `SET` from a `connect` handler leaves a window where
      // the first query can run without it, silently matching nothing.
      options: `-c pg_trgm.word_similarity_threshold=${WORD_SIMILARITY_THRESHOLD}`,
    });

    return drizzle(pool, { schema });
  },
};
