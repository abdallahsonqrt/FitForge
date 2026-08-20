# Fitness App — Coach-Centric Product Direction

## Product vision

Build a personalized fitness platform where qualified human coaches create the training experience and an AI assistant makes it easy to follow every day. The product should feel useful for a beginner with limited equipment and powerful enough for a coach to run a scalable coaching business.

**Positioning:** _Human coaching, made practical by AI._

The app is not a generic exercise-video library. It connects users with coaches and programs that match their sport, goals, equipment, and training location. Coaches provide the training plans, exercise demonstrations, and human guidance; AI handles the day-to-day support, tracking, reminders, and routine questions.

## The problem we solve

Users often do not know what workout is appropriate for their goal, experience, or equipment. They also lack consistency, clear instruction, and someone to ask when training feels difficult or painful. Building a huge exercise-video library internally is expensive and makes the experience generic.

The coach-centric model solves these problems:

- Coaches create focused programs and demonstration videos.
- Users can choose expertise that fits their sport and circumstances.
- Coaches can answer meaningful questions and review progress.
- AI handles repetitive support so coaches can serve more users.
- Coach-created content builds a differentiated, growing library.

## Core users

### Athlete / trainee

Someone who wants a structured plan and support. Example: a beginner training calisthenics at home with only a pull-up bar.

### Coach

A verified fitness professional or experienced specialist who publishes programs, creates exercise content, manages clients, and communicates with them.

### Platform admin

Reviews coaches and content, manages plans and subscriptions, handles moderation, and monitors platform health.

## Product pillars

1. **Coach system** — profiles, specialties, programs, exercise library, client relationships, and messaging.
2. **AI assistant** — daily guidance, workout/nutrition logging, reminders, FAQs, and escalation to the coach.
3. **Nutrition system** — simple calorie and macro tracking that supports a user's training goal.
4. **Progress system** — workouts, adherence, body metrics, photos, and coach-visible trends.
5. **Subscription system** — clear tiers that define the level of coach access and AI features.

## User journey

### 1. Public landing experience

Before login, visitors see what the app is, how it works, featured coaches, subscription tiers, testimonials or results, and clear Login / Create account actions.

### 2. Onboarding

After registration, gather only the information needed to make a useful initial match:

- Primary goal: muscle gain, fat loss, strength, skill improvement, general fitness.
- Sport / interest: calisthenics, bodybuilding, powerlifting, running, boxing, football, and more.
- Experience: beginner, intermediate, advanced.
- Equipment: pull-up bar, dumbbells, resistance bands, gym access, bodyweight/no equipment, etc.
- Training location: home, gym, outdoors.
- Availability: training days and preferred session duration.
- Optional: age range, height/weight, dietary preferences, injuries/limitations.

At the end, recommend suitable coaches and programs. The user may select a recommendation or browse instead.

### 3. Choose coach and program

A coach profile should show:

- Photo, name, short introduction, languages, location/time zone if relevant.
- Specialties and supported goals.
- Experience/credentials and verification status.
- Equipment and training environments supported.
- Available programs, duration, difficulty, and required equipment.
- Rating/reviews when the marketplace is mature.
- What the subscriber receives: plan access, messaging response expectation, form reviews, check-ins.

### 4. Daily athlete experience

The home screen should answer: **What should I do today?**

- Today's workout with exercise cards, sets/reps/time, rest, video, instructions, and common mistakes.
- Quick completion logging and perceived difficulty.
- AI chat for simple questions, motivation, workout adjustments, and meal logging.
- Coach messaging for questions that need professional/personal context.
- Nutrition summary and simple meal logging.
- Progress and streaks without making the app feel punitive.

### 5. Coach workspace

Coaches need an efficient creator and client-management workspace:

- Create/edit programs, weeks, workout days, and exercises.
- Upload exercise videos and add instructions, cues, regressions, progressions, and common mistakes.
- Define program eligibility (goal, level, equipment, location).
- View assigned athletes, adherence, recent workout feedback, and questions needing attention.
- Message clients and optionally request a form-check video.
- Set availability, prices, included services, and response-time expectations.

## Exercise and content model

An exercise is a reusable record. It must not exist only as text inside a workout.

Recommended fields:

- Name and category (push, pull, legs, core, mobility, cardio).
- Primary/secondary muscles (optional for MVP).
- Equipment required.
- Difficulty level.
- Coach video URL and thumbnail.
- Step-by-step instructions.
- Key technique cues.
- Common mistakes and safety notes.
- Regression and progression variations.

Programs should reference exercises. This lets a coach update an exercise video or its instructions once and have the improved content appear wherever it is used.

## AI assistant responsibilities and limits

The AI is a support layer, not an unqualified replacement for a coach or medical professional.

### It should do

- Explain a coach's program and today's session in simple language.
- Help log workouts, sets, reps, duration, effort, weight, and missed sessions.
- Suggest low-risk routine adjustments within coach-defined rules (for example, a lighter session after a missed week).
- Estimate and log meals, calories, and macros; always show estimates as estimates.
- Send helpful reminders and recognize consistency.
- Summarize relevant questions and progress for the coach.
- Route messages to the coach when the user asks for personal programming decisions or feedback.

### It should not do

- Diagnose injuries, prescribe medical treatment, or dismiss pain.
- Make major training or nutrition changes that conflict with a coach's program.
- Invent coach advice, credentials, plan details, or nutritional values.

For pain, injury, eating-disorder concerns, or medical questions, show a clear safety message and encourage an appropriate qualified professional. Allow the user to contact their coach when suitable.

## Nutrition experience

Nutrition should be approachable at launch, not a complicated dietitian platform.

MVP capabilities:

- Daily calorie and macro targets set by the coach or AI-assisted onboarding rules.
- Manual meal logging with food, portion, meal type, calories, protein, carbs, and fat.
- Natural-language input such as “I ate chicken shawarma and rice”; AI returns an editable estimate before logging.
- Daily progress summary and weekly consistency trend.
- Dietary preferences/allergies as profile data.

Later capabilities: barcode scanning, regional food database, recipe builder, meal plans, grocery lists, and coach nutrition review.

## Subscription model

Use a simple platform membership structure initially. Coach-specific pricing and marketplace commissions can follow once coach operations are validated.

| Tier | Purpose | Example mock price | Included |
| --- | --- | --- | --- |
| Free | Let users explore and build trust | $0 | Limited workout preview, basic tracking, browse coaches/programs |
| Starter | Self-guided users | $9/month | Full selected program access, AI workout support, basic nutrition logging, progress tracking |
| Coach | Users wanting human guidance | $29/month + coach add-on if applicable | Everything in Starter, direct coach messaging, scheduled check-ins, personalized plan updates |
| Pro Coaching | Premium transformation service | $79/month+ | Everything in Coach, priority responses, form reviews, deeper nutrition and progress support |

Prices above are mock product data for design and early testing, not a final commercial decision. Make the exact coach service and response expectation visible before purchase.

## Marketplace roadmap

Do **not** begin as a fully open marketplace. Validate quality and workflows with a curated group of coaches first.

### Phase 1 — Curated coaching MVP

- 3–10 approved coaches.
- A small set of strong, distinct programs.
- One-to-one coach-client assignment.
- Coach-created videos and in-app messaging.
- Manual coach verification and content review.

### Phase 2 — Discovery and matching

- Coach directory with filtering by sport, goal, equipment, language, and price.
- Recommendations based on onboarding.
- Ratings/reviews from verified subscribers.
- Coach availability and capacity controls.

### Phase 3 — Marketplace operations

- Coach applications and verification workflow.
- Coach payouts/commission model.
- Coach-specific subscription products.
- Moderation, reporting, content ownership policy, and dispute support.

## Key screens

### Athlete-facing

- Landing / introduction page.
- Login and registration.
- Onboarding questionnaire.
- Coach directory and coach profile.
- Program detail and checkout/subscription selection.
- Home dashboard / today's plan.
- Workout player and exercise detail/video.
- AI assistant chat.
- Coach messages.
- Nutrition log.
- Progress dashboard.
- Profile and subscription management.

### Coach-facing

- Coach dashboard.
- Client list and client detail.
- Program builder.
- Exercise library and video upload.
- Messages/form-review queue.
- Availability and subscription offerings.

### Admin-facing (can be internal first)

- Coach approval.
- Content moderation.
- User/coach support view.
- Subscription status and basic metrics.

## Suggested domain data model

Use a relational design with proper authorization; the names can change to match the existing codebase.

- `users` — account identity and role (athlete, coach, admin).
- `athlete_profiles` — goals, level, equipment, availability, preferences.
- `coach_profiles` — bio, specialties, credentials, verification, languages, availability.
- `programs` — coach-owned program metadata, duration, target audience, visibility, price.
- `program_weeks` and `workouts` — ordered plan structure.
- `exercises` — reusable coach-owned/exercise records.
- `workout_exercises` — sets, reps, rest, order, notes and exercise reference.
- `exercise_media` — video, thumbnail, caption, and ownership metadata.
- `enrollments` — athlete-program/coach relationship and status.
- `workout_logs` and `set_logs` — completion, performance, effort, feedback.
- `conversations` and `messages` — athlete/coach communication.
- `nutrition_targets`, `meal_logs`, and `food_items` — nutrition tracking.
- `subscriptions` and `payments` — plan, status, renewal details (use a payment provider; never store card data directly).
- `progress_entries` — weight, measurements, photos, notes (strict privacy controls).

## Permissions and trust requirements

- Coaches can access only their enrolled/assigned athletes and their own content.
- Athletes can access only programs they have permission to use and their own private data.
- Exercise videos remain owned by the coach under clear platform licensing terms.
- Private messages, progress photos, health-related answers, and payment data require strong access controls.
- Let users report coaches/content and block inappropriate contact.
- Clearly label verified coaches and avoid implying medical qualifications where none exist.

## Implementation priorities

### MVP: prove the daily coaching loop

1. Public landing page, registration/login, and onboarding.
2. Curated coach profiles and program discovery with mock data.
3. Athlete dashboard showing today's workout.
4. Workout player with exercise instructions and coach video support.
5. Workout completion logging.
6. Basic athlete–coach messaging.
7. Simple coach program builder and exercise/video management.
8. Basic AI chat that knows the athlete's selected program and can safely escalate to coach support.
9. Subscription UI and entitlement model; use test/mock payment state until payment integration is ready.

### Next: make it habit-forming and scalable

1. Nutrition logging and editable AI meal estimates.
2. Progress charts, check-ins, and automated coach summaries.
3. Form-review uploads.
4. Notifications/reminders.
5. Coach directory filters, reviews, and coach capacity.
6. Production payments and marketplace payouts.

## Success metrics

- Onboarding completion rate.
- Percentage of new users who select a coach/program.
- First-workout completion rate within 24 hours.
- Weekly workout adherence.
- Coach response time and athlete conversation resolution.
- Trial-to-paid conversion and subscription retention.
- Coach retention, active programs, and client capacity.

## Product principles

- Lead users to a clear next action: today's workout, today's food log, or a question for their coach.
- Keep beginner language friendly and non-judgmental.
- Make coach expertise visible, specific, and trustworthy.
- Prefer a small, polished content library over a large generic one.
- Build all early interfaces with believable mock data so the product can be tested before backend completion.
- Design safety and privacy into the first version rather than adding them after launch.

