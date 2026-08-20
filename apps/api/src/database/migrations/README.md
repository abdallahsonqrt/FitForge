# Migrations

## Apply them with `npm run db:migrate`

**Never `drizzle-kit push`.** Parts of this schema cannot be expressed in the
Drizzle DSL and exist only in the SQL here:

| Lives only in SQL | Created by |
| --- | --- |
| `pg_trgm` extension | `0001_food_search.sql` |
| GIN `gin_trgm_ops` indexes on `foods.search_name`, `food_translations.search_name`, `foods.search_keywords` | `0001`, `0004` |
| Generated `search_vector` tsvector columns + their GIN indexes | `0001_food_search.sql` |
| GIN index on `exercises.name` | `0003_exercise_media.sql` |
| Unique functional index `users_email_lower_idx` on `lower(email)` | `0007_auth_sessions.sql` |

`push` syncs the database to the TypeScript schema, so it would drop every row
of that table — and `food-catalog.service.ts` references `search_vector` and the
`%` trigram operator by name, so food search would fail immediately. `db:push`
is wired to refuse for that reason; the underlying command still exists if you
genuinely need it.

## Snapshot history has a gap — this is deliberate

`meta/` holds `0000`, `0001` and `0004` snapshots. **There is no `0002` or
`0003`.** Those two migrations were hand-written without generating snapshots,
which left drizzle-kit diffing the current schema against `0001` and trying to
re-emit the entire exercise refactor on every `generate`.

`0004_snapshot.json` was rebuilt from the TypeScript schema with
`generateDrizzleJson` and chained onto `0001`, which restores `generate`. Only
the newest snapshot is consulted when diffing, so the missing pair costs nothing
in practice — `drizzle-kit up` is the only command that walks the full chain.

Before it was installed, the SQL and the schema were checked against each other:
every table and column agreed, apart from the two `search_vector` columns, which
are intentionally absent from the schema per the table above.

## Writing a new migration

Prefer `npm run db:generate`. It works, and it now reports real drift rather
than noise.

Hand-write one only for what the DSL cannot express (extensions, index opclasses,
generated columns, data backfills). When you do:

1. Add the `.sql` file and a matching `_journal.json` entry.
2. Leave anything the DSL cannot express **out** of `src/database/schema/*.ts`,
   with a comment saying where it really lives. Declaring a GIN index as a plain
   btree makes the next `generate` swap the real index for a useless one.
3. Regenerate the newest snapshot so the history stays usable:

   ```js
   // node, from apps/api, after `npx nest build`
   const { generateDrizzleJson } = require('drizzle-kit/api');
   const schema = require('./dist/database/schema/index.js');
   const prev = require('./src/database/migrations/meta/<previous>_snapshot.json');
   require('fs').writeFileSync(
     'src/database/migrations/meta/<new>_snapshot.json',
     JSON.stringify(generateDrizzleJson(schema, prev.id), null, 2),
   );
   ```

4. Confirm with `npm run db:generate` — it should say *"No schema changes"*.
