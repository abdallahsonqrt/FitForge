# FitForge — Premium Fitness App

A full-stack fitness and coaching platform: **React Native (Expo)** on the front, **NestJS + PostgreSQL** behind it, in a single TypeScript monorepo.

Athletes get programs, AI-assisted meal logging, and progress tracking. Coaches get a workspace to build programs, manage clients, and message them.

```
fitforge/
├── apps/
│   ├── mobile/    # React Native (Expo) — iOS, Android, and web
│   └── api/       # NestJS REST API
├── packages/
│   └── shared/    # TypeScript types shared by both apps
└── package.json   # npm workspaces root
```

---

## Screenshots

Captured from the running app on Expo web at an iPhone-sized viewport, against a
locally seeded database.

### Athlete

| Home | Training | Nutrition | Progress |
|:--:|:--:|:--:|:--:|
| <img src="docs/screenshots/athlete-home.png" alt="Home screen with the recommended workout, calorie ring, steps and water" width="200"> | <img src="docs/screenshots/athlete-training.png" alt="Training screen listing plans filtered by subscription tier" width="200"> | <img src="docs/screenshots/athlete-nutrition.png" alt="Nutrition screen with calories, macro rings, water, steps and the day's meals" width="200"> | <img src="docs/screenshots/athlete-progress.png" alt="Progress screen with streak, weight trend chart and workout calendar" width="200"> |
| Recommended workout and targets derived from the profile | Plans filtered by tier | Macros, water and steps for the day | Streak, weight trend and workout calendar |

### Coach workspace

| Dashboard | Programs | Clients |
|:--:|:--:|:--:|
| <img src="docs/screenshots/coach-dashboard.png" alt="Coach dashboard with client, program, message and request counts" width="200"> | <img src="docs/screenshots/coach-programs.png" alt="Coach programs list with visibility filters and published programs" width="200"> | <img src="docs/screenshots/coach-clients.png" alt="Coach client roster with status filters and accept, decline, pause and complete actions" width="200"> |
| Counts and quick actions | Filter by visibility, publish, archive | The status transitions the API allows |

### Getting in

| Landing | Onboarding |
|:--:|:--:|
| <img src="docs/screenshots/landing.png" alt="Marketing landing page with the coach directory call to action" width="200"> | <img src="docs/screenshots/onboarding.png" alt="First onboarding step asking for gender, with a progress bar" width="200"> |
| Public page, served by the same Expo app | 1 of 13 steps |

---

## Tech stack

### Frontend
| | |
|---|---|
| React Native `0.76` / Expo SDK `52` | iOS, Android, and web via `react-native-web` |
| Expo Router `v4` | File-based routing |
| TypeScript | Strict mode |
| React Native Unistyles `v2` | Theming, light/dark |
| Zustand `v5` | Client state (auth, onboarding, preferences) |
| TanStack Query `v5` | Server state, caching, invalidation |
| Reanimated + Moti | Animation |
| Lucide + react-native-svg | Icons and charts |
| MMKV | Persisted session and preferences (native) |

### Backend
| | |
|---|---|
| NestJS `v10` | Modular API framework |
| Drizzle ORM `0.33` | Type-safe SQL, migration-first |
| PostgreSQL `16` | With `pg_trgm` for food search |
| Passport JWT | Access + refresh tokens, rotation |
| Argon2 | Password hashing |
| Zod (`nestjs-zod`) | Request validation |
| Vercel AI SDK | Language-only meal extraction |
| Swagger / OpenAPI | Interactive docs at `/api/docs` |

---

## Getting started

### Prerequisites
- Node.js 20+
- PostgreSQL 16+
- npm

### Setup

```bash
npm install                     # installs every workspace

cd apps/api
cp .env.example .env            # fill in DATABASE_URL and the two JWT secrets
npm run db:migrate              # apply migrations  ← not `drizzle-kit push`
npm run db:seed                 # exercises, foods, plans, badges, demo coaches
npm run start:dev               # http://localhost:3000

# in a second terminal
cd apps/mobile
npx expo start                  # press i / a / w for iOS, Android, web
```

> **Never run `drizzle-kit push` against this schema.** Parts of it — the
> `pg_trgm` extension, the GIN trigram indexes, and the generated `search_vector`
> columns — exist only in the migration SQL and cannot be expressed in the
> Drizzle DSL. `push` syncs the database *to the TypeScript schema* and would
> drop them, breaking food search immediately. The `db:push` script is wired to
> refuse for that reason. See `apps/api/src/database/migrations/README.md`.

### Environment

Only three variables are required; everything else has a working default. `apps/api/.env.example` documents all of them.

```env
DATABASE_URL=postgres://user:password@localhost:5432/fitforge
JWT_SECRET=<a long random string>
JWT_REFRESH_SECRET=<a different long random string>
```

Worth knowing about the optional ones:

| Variable | Why you might set it |
|---|---|
| `CORS_ORIGINS` | Browser origins allowed to call the API. Defaults to the Expo dev server only — a deployed web front-end is blocked until listed. |
| `TRUST_PROXY` | `false` when the API faces the internet directly. Behind a load balancer set it to the hop count, or every request looks like the proxy and the whole user base shares one rate-limit bucket. |
| `APP_PUBLIC_URL` | Where password-reset links point. Defaults to the `fitforge://` app scheme. |
| `ALLOW_UNPAID_UPGRADES` | `POST /subscriptions/upgrade` is a **mock purchase** with no payment provider. Off in production unless set explicitly, so deploying before billing exists cannot give the paid tiers away. |
| `OPENAI_API_KEY` | AI meal logging. Without it those endpoints return a clear 503; everything else works. |
| `USDA_FDC_API_KEY` | Food search falls back to Open Food Facts alone without it, which mostly knows packaged products. |
| `R2_*` | Exercise video/image storage. Without it the API still boots and serves existing media; uploads return 503. |

---

## Features

### Authentication
- Email/password with JWT access (15 min) + refresh (7 day) tokens, rotated on every refresh.
- **Sessions are revocable.** An access token is bound to a device row; logging out kills it on the next request rather than leaving it valid for its remaining lifetime.
- **Password reset** — single-use, one-hour, digest-only tokens. Redeeming one destroys every session for the account. Requests answer identically for known and unknown addresses, so the endpoint is not an account-existence oracle.
- Brute force is throttled **per account** (not per IP), so an attacker cannot lock a victim out of their own account.
- Device limit enforced per subscription tier.

**Web vs native token handling** — on native the refresh token travels in the JSON body. In a browser it is sent as an `HttpOnly; SameSite=Lax` cookie and the access token is held **in memory only**, so no token is readable from `localStorage` by page script.

> **No email transport is configured.** Reset links are written to the server log outside production; in production the attempt is logged at `error` and the request still answers `202`. Wiring a provider means replacing the body of `PasswordResetDelivery.send` and nothing else.

### Onboarding
13 steps — gender, age, height, weight, sport, goal, experience, activity level, training location, equipment, session duration, workout frequency, diet preferences — saved to the athlete profile and used for coach/program matching and calorie targets.

### Athlete app
- **Home** — recommended workout, calorie ring, steps, water, streak. Targets derive from the profile (Mifflin-St Jeor BMR × activity, adjusted for goal).
- **Training** — plans filtered by tier; normalised exercise library with muscles, equipment, instructions, coaching tips and common mistakes; instructional video.
- **Active workout** — timer, rest countdown, per-set logging. Reps and load are **persisted per set** (`set_logs`), not just session duration.
- **Nutrition** — conversational AI logging, food search, custom foods, macro summary, water and step tracking.
- **Progress** — weight chart, workout history, streak calendar, badges.

### Coach workspace
A sibling navigation group to the athlete tabs — a coach and an athlete are different jobs.

- **Dashboard** — client and program counts, quick actions.
- **Programs** — create, filter by visibility, publish, archive, delete.
- **Program builder** — weeks and workouts with add/delete/reorder, per-exercise prescriptions (sets, reps, rest, coaching notes) picked from the exercise library.
- **Clients** — roster with status filters and the transitions the API actually allows (accept, decline, pause, resume, complete).
- **Messages** — inbox and threads with cursor-paged history.
- **Profile** — headline, bio, specialties, supported goals/levels/locations/equipment, pricing, capacity, accepting-clients toggle. Saves as a diff.

Reordering uses explicit move-up/move-down buttons rather than drag-and-drop: dragging is a gesture only a pointing device can make, and is unreachable from a keyboard or a screen reader.

### Streaks and badges
A day counts as active when a **workout or a meal** is logged. The counter is idempotent per day — three meals is still one day.

`STREAK_GRACE_DAYS = 1`: miss one whole day and the streak survives, go quiet for two and it resets. Both the advance path and the nightly sweep read that one constant, so "still alive" and "counts as continuing" cannot drift apart.

Ten of the twelve seeded badges are awarded automatically (workout counts, streak milestones, early-bird/night-owl, weight lost, meals logged). **Two are deliberately not implemented**, because the data to decide them honestly does not exist yet:

| Badge | What is missing |
|---|---|
| Perfect Week | `workout_logs` records a `plan_id` but not which planned day it satisfied, and catalogue plans carry no per-user schedule. |
| Hydration Hero | The daily water goal is derived on the client from height/weight/activity and never stored server-side. Deciding it in the API would mean a second copy of the formula that could disagree with the number the user sees. |

### Notifications
Written when an enrollment is created or changes status, and when a message arrives. The actor is never notified of their own action. A notification failure can never fail the thing that triggered it.

### Subscriptions
The ladder is **Free → Starter → Coach → Pro Coaching**, gating coach access, program access, device count and AI log quota. `pro` and `elite` are legacy stored values that the API bridges at read time; nothing outside `entitlements.ts` may special-case them. Clients gate UI on resolved **entitlements**, never on tier names.

### Exercise media (Cloudflare R2)
Bytes never enter Postgres — the database stores metadata and an object key.

```
Application code  →  StorageService  →  CloudflareR2StorageProvider  →  R2
                     (the only door)     (the only file importing an S3 SDK)
```

Swapping providers means writing one class satisfying `StorageProvider` and adding a case to `StorageModule`. Uploads are validated by magic bytes rather than the declared content type, size-capped, SHA-256 checksummed, probed with ffprobe, and given a poster frame. `ffmpeg-static`/`ffprobe-static` are optional — without them uploads still succeed, just unmeasured and without a thumbnail.

### How AI meal logging works

The model **only reads language**. It extracts names, quantities and units and returns structured JSON — it is never asked for, and has no field to return, a calorie figure. The backend computes nutrition from stored per-100 g data:

```
"I had two eggs"  ──▶  MealIntentService   {name: "Egg", quantity: 2, unit: "piece"}
                  ──▶  FoodResolverService catalogue lookup ──▶ 100 g ──▶ 143 kcal
                  ──▶  MealLogService      meal + items, totals rolled up
```

Food lookup is local-first and self-warming: a term that misses locally is fetched from USDA and Open Food Facts and **written back into Postgres**, so it is never fetched twice.

---

## Testing

```bash
cd apps/api
npm test           # 410 unit tests
npm run lint       # ESLint
npm run build      # nest build
npx tsc --noEmit   # typecheck

cd ../mobile
npx tsc --noEmit   # typecheck
```

Tests concentrate on the rules that are expensive to get wrong: authorization and IDOR, enrollment state transitions, entitlement resolution, food search ranking, streak boundaries, and badge thresholds. There is no e2e harness yet — `test:e2e` points at a config that does not exist.

---

## API

Swagger UI at `http://localhost:3000/api/docs` while the API is running (non-production only).

**Every endpoint requires authentication by default.** `JwtAuthGuard` and `RolesGuard` are registered globally; routes opt *out* with `@Public()`, and only two do (`GET /coaches`, `GET /coaches/:id`). Responses are enveloped:

```jsonc
{ "data": …, "meta": { "success": true, "timestamp": "…" } }
```

### Auth
| Method | Route | Description |
|:---|:---|:---|
| `POST` | `/auth/register` | Create an account. `role` is not accepted — privilege cannot be self-assigned. |
| `POST` | `/auth/login` | Returns tokens; browsers also get the refresh cookie. |
| `POST` | `/auth/refresh` | Rotates the pair. |
| `POST` | `/auth/logout` | Ends this session. |
| `POST` | `/auth/forgot-password` | Always `202`, known address or not. |
| `POST` | `/auth/reset-password` | Redeems a token, then destroys every session. |

### Coaching
| Method | Route | Description |
|:---|:---|:---|
| `GET` | `/coaches` | Public directory (verified coaches only). |
| `POST` | `/coaches/apply` | Apply. Creates a `pending` profile; an admin approves. |
| `GET` `PATCH` | `/coaches/me` | The coach's own profile. **Coach.** |
| `GET` `POST` | `/coaches/me/programs` | List and create. **Coach.** |
| `…` | `/coaches/me/programs/:planId/weeks/…/days/…/exercises` | 21 routes covering the builder, all ownership-checked. **Coach.** |
| `GET` | `/coaches/me/dashboard` | Counts and recent activity. **Coach.** |
| `POST` `GET` `PATCH` | `/enrollments` | Enrol, list, transition status. |
| `GET` `POST` | `/conversations/:id/messages` | Cursor-paged thread, send. Participants only. |

### Nutrition
| Method | Route | Description |
|:---|:---|:---|
| `POST` | `/nutrition/chat` | One conversational turn. Status `logged`, `needs_clarification` or `draft`. |
| `POST` | `/nutrition/log` | Log from chosen catalogue foods. |
| `GET` | `/nutrition/today` · `/nutrition/history` | Daily totals; range averages. |
| `GET` | `/foods/search` · `/foods/autocomplete` | Local-first search; prefix suggestions. |
| `POST` | `/foods/custom` | Create a food. Admins may pass `shared: true`. |

### Training and progress
| Method | Route | Description |
|:---|:---|:---|
| `GET` | `/exercises` · `/exercises/taxonomy` · `/exercises/:idOrSlug` | Library, filter vocabulary, detail. |
| `POST` | `/progress/workouts` | Log a session **with its sets**. |
| `GET` `POST` | `/progress/weight` · `/progress/measurements` | Body metrics. |
| `GET` | `/progress/badges` · `/streaks` | Earned badges; current and longest streak. |

Exercise-media routes (upload, direct-to-bucket, playback, thumbnails) are admin-only and documented in Swagger.

---

## Project structure

### Backend modules (`apps/api/src/modules`)
| Module | Responsibility |
|:---|:---|
| `auth` | Registration, login, JWT rotation, password reset, throttling |
| `users` | Profile, onboarding |
| `coaches` | Profiles, directory, applications, program builder, clients |
| `enrollments` | The athlete↔coach↔program relationship and its state machine |
| `messaging` | Coach↔athlete threads |
| `training` | Workout plans, exercise library, taxonomy |
| `exercise-media` | Upload, storage lifecycle, playback URLs |
| `nutrition` | Meals, conversational logging, water, steps |
| `food` | Catalogue search, USDA / Open Food Facts fallback, custom foods |
| `ai-logger` | Language-only meal extraction |
| `progress` | Weight, measurements, workout and set logs |
| `streaks` · `badges` | Engagement rules and awards |
| `notifications` | Enrollment and message alerts |
| `subscriptions` | Tiers and entitlement resolution |
| `devices` | Registration and per-tier limits |
| `admin` | Users, coach applications, plan catalogue |

Cross-cutting: `src/storage` (provider-agnostic object storage), `src/database` (38 schema files, 14 migrations), `src/common` (guards, pipes, filters, interceptors).

### Frontend navigation (`apps/mobile/app`)
| Group | Screens |
|:---|:---|
| `(auth)` | Login, Register, Forgot Password, Reset Password |
| `(onboarding)` | 13 profile steps |
| `(tabs)` | Home, Training, Nutrition, Progress, Profile |
| `(coach)` | Dashboard, Programs, Clients, Messages, Profile |
| `coach/*` | Program builder, Client detail, Conversation |
| `workout/*` | Plan detail, Active session, Exercise detail |
| `meal/*` | AI logger, Calculator |
| `settings/*` | Account, Devices, Theme, Notifications, Language, Units |

Localised in **English, Arabic, German, Spanish and French** (378 keys each, kept in parity by the type system — a missing key is a compile error). Arabic flips layout direction.

---

## Known gaps

Documented rather than hidden, so nobody rediscovers them the hard way.

| Gap | Impact |
|---|---|
| No email transport | Password reset works end to end but the link only reaches the server log. |
| No payment provider | `POST /subscriptions/upgrade` is a mock, gated off in production by default. |
| A coach cannot start a conversation | `POST /conversations` resolves the caller as the athlete side. A coach can only reply to an existing thread. |
| Perfect Week / Hydration Hero badges | Need a completed-session link and a stored water goal respectively. |
| No e2e test harness | `test:e2e` references a config that was never written. |
| Server-time day boundaries | `users` has no timezone, so streak days roll over on the server's clock. |
| Coach profile editor | Credentials, languages and timezone are not yet editable. |

---

## License

Private — all rights reserved.
