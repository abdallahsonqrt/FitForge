import 'dotenv/config';
import { Pool } from 'pg';
import { drizzle } from 'drizzle-orm/node-postgres';
import { eq } from 'drizzle-orm';
import * as schema from './schema';
import { seedFoods } from './seeds/foods.seed';
import { seedExerciseLibrary } from './seeds/exercises.seed';
import { seedCoaches } from './seeds/coaches.seed';

/**
 * Seeds the catalogue content the app reads but never creates: subscription
 * plans, the exercise library, starter workout plans, badge definitions and the
 * starter food catalogue.
 *
 * Idempotent — every insert is keyed on a natural unique value (plan tier,
 * exercise slug, badge name, normalised food name), so re-running only fills in
 * what is missing.
 *
 * Exercise content lives in `seeds/exercises.seed.ts`, which also owns the
 * category, muscle and equipment catalogues it references.
 */

/**
 * The membership ladder.
 *
 * The first four are the coach-centric tiers: what separates them is how much of
 * a coach's attention they buy, which is why `coachAccess`, `formReviews` and
 * `scheduledCheckIns` are columns rather than marketing copy — the entitlement
 * has to be enforceable, and the exact coach service has to be visible before
 * purchase.
 *
 * `pro` and `elite` follow them as the original self-guided tiers. They stay
 * because existing plans and subscriptions still reference them; removing a tier
 * an active subscription points at would orphan it.
 */
const SUBSCRIPTION_PLANS: (typeof schema.subscriptionPlans.$inferInsert)[] = [
  { name: 'Free', tier: 'free', priceCents: 0, deviceLimit: 1, aiLogLimit: 5, coachAccess: 'none' },
  { name: 'Starter', tier: 'starter', priceCents: 900, deviceLimit: 2, aiLogLimit: 30, coachAccess: 'none' },
  {
    name: 'Coach',
    tier: 'coach',
    priceCents: 2900,
    deviceLimit: 3,
    aiLogLimit: 100,
    coachAccess: 'messaging',
    scheduledCheckIns: true,
  },
  {
    name: 'Pro Coaching',
    tier: 'pro_coaching',
    priceCents: 7900,
    deviceLimit: -1,
    aiLogLimit: -1,
    coachAccess: 'priority',
    formReviews: true,
    scheduledCheckIns: true,
  },

  // Legacy self-guided tiers.
  { name: 'Pro', tier: 'pro', priceCents: 999, deviceLimit: 3, aiLogLimit: 30, coachAccess: 'none' },
  { name: 'Elite', tier: 'elite', priceCents: 1999, deviceLimit: -1, aiLogLimit: -1, coachAccess: 'none' },
];

/** `[exerciseName, sets, reps, restSeconds]` */
type DaySpec = { dayName: string; exercises: [string, number, number, number][] };

const WORKOUT_PLANS: {
  name: string;
  description: string;
  difficulty: 'beginner' | 'intermediate' | 'advanced';
  tier: 'free' | 'pro' | 'elite';
  days: DaySpec[];
}[] = [
  {
    name: 'Foundation Builder',
    description: 'A four-week full-body programme for building a base of strength and confidence in the gym.',
    difficulty: 'beginner',
    tier: 'free',
    days: [
      {
        dayName: 'Day 1: Full Body A',
        exercises: [['Back Squat', 3, 8, 120], ['Bench Press', 3, 8, 120], ['Barbell Row', 3, 10, 90], ['Plank', 3, 30, 60]],
      },
      {
        dayName: 'Day 2: Full Body B',
        exercises: [['Romanian Deadlift', 3, 8, 120], ['Overhead Press', 3, 8, 120], ['Lat Pulldown', 3, 10, 90], ['Bicep Curl', 3, 12, 60]],
      },
      {
        dayName: 'Day 3: Full Body C',
        exercises: [['Leg Press', 3, 12, 90], ['Push-up', 3, 12, 60], ['Pull-up', 3, 6, 120], ['Calf Raise', 3, 15, 60]],
      },
    ],
  },
  {
    name: 'Hypertrophy Mastery',
    description: 'An eight-week push/pull/legs split built for muscle growth, with the volume ramped week over week.',
    difficulty: 'intermediate',
    tier: 'pro',
    days: [
      {
        dayName: 'Day 1: Push',
        exercises: [['Bench Press', 4, 8, 120], ['Incline Dumbbell Press', 3, 10, 90], ['Overhead Press', 3, 10, 90], ['Lateral Raise', 3, 15, 60], ['Tricep Pushdown', 3, 12, 60]],
      },
      {
        dayName: 'Day 2: Pull',
        exercises: [['Deadlift', 4, 6, 180], ['Pull-up', 3, 8, 120], ['Barbell Row', 3, 10, 90], ['Hammer Curl', 3, 12, 60]],
      },
      {
        dayName: 'Day 3: Legs',
        exercises: [['Back Squat', 4, 8, 150], ['Romanian Deadlift', 3, 10, 120], ['Leg Press', 3, 12, 90], ['Calf Raise', 4, 15, 45]],
      },
      {
        dayName: 'Day 4: Upper Accessory',
        exercises: [['Incline Dumbbell Press', 3, 12, 90], ['Lat Pulldown', 3, 12, 90], ['Lateral Raise', 3, 15, 45], ['Hanging Leg Raise', 3, 12, 60]],
      },
    ],
  },
  {
    name: 'Elite Power',
    description: 'A twelve-week strength block centred on the big three, with accessory work to keep the lifts moving.',
    difficulty: 'advanced',
    tier: 'elite',
    days: [
      {
        dayName: 'Day 1: Max Effort Lower',
        exercises: [['Back Squat', 5, 5, 210], ['Romanian Deadlift', 4, 6, 150], ['Leg Press', 3, 10, 120], ['Hanging Leg Raise', 3, 15, 60]],
      },
      {
        dayName: 'Day 2: Max Effort Upper',
        exercises: [['Bench Press', 5, 5, 210], ['Overhead Press', 4, 6, 150], ['Barbell Row', 4, 8, 120], ['Dips', 3, 10, 90]],
      },
      {
        dayName: 'Day 3: Dynamic Lower',
        exercises: [['Deadlift', 5, 3, 240], ['Back Squat', 3, 8, 150], ['Calf Raise', 4, 12, 60]],
      },
      {
        dayName: 'Day 4: Dynamic Upper',
        exercises: [['Bench Press', 4, 8, 150], ['Pull-up', 4, 8, 120], ['Lateral Raise', 3, 15, 45], ['Tricep Pushdown', 3, 12, 60]],
      },
    ],
  },
];

const BADGES = [
  { name: 'First Steps', description: 'Complete your first workout' },
  { name: 'Week Warrior', description: 'Reach a 7-day streak' },
  { name: 'Monthly Master', description: 'Reach a 30-day streak' },
  { name: 'Century Club', description: 'Reach a 100-day streak' },
  { name: 'Half Century', description: 'Complete 50 workouts' },
  { name: 'Centurion', description: 'Complete 100 workouts' },
  { name: 'Transformation', description: 'Lose 5 kg from your starting weight' },
  { name: 'Perfect Week', description: 'Hit every planned workout in a week' },
  { name: 'Early Bird', description: 'Complete 10 workouts before 7 AM' },
  { name: 'Night Owl', description: 'Complete 10 workouts after 9 PM' },
  { name: 'Hydration Hero', description: 'Hit your water goal 30 days in a row' },
  { name: 'Meal Master', description: 'Log 100 meals' },
];

async function main() {
  if (!process.env.DATABASE_URL) {
    throw new Error('DATABASE_URL is not set. Run this from apps/api with a configured .env.');
  }

  const pool = new Pool({ connectionString: process.env.DATABASE_URL });
  const db = drizzle(pool, { schema });
  const counts = {
    plans: 0,
    categories: 0,
    muscles: 0,
    equipment: 0,
    exercises: 0,
    workoutPlans: 0,
    badges: 0,
    coaches: 0,
    coachPrograms: 0,
    foods: 0,
    foodTranslations: 0,
    foodServings: 0,
  };

  try {
    for (const plan of SUBSCRIPTION_PLANS) {
      const existing = await db.query.subscriptionPlans.findFirst({
        where: eq(schema.subscriptionPlans.tier, plan.tier),
      });
      if (existing) continue;
      await db.insert(schema.subscriptionPlans).values(plan);
      counts.plans += 1;
    }

    // The library, plus the catalogues it links to. Returns an id-by-name map so
    // the plan specs below can go on referencing lifts by name.
    const library = await seedExerciseLibrary(db);
    const exerciseIds = library.exerciseIds;
    counts.categories = library.categories;
    counts.muscles = library.muscles;
    counts.equipment = library.equipment;
    counts.exercises = library.exercises;

    for (const plan of WORKOUT_PLANS) {
      const existing = await db.query.workoutPlans.findFirst({
        where: eq(schema.workoutPlans.name, plan.name),
      });
      if (existing) continue;

      const [createdPlan] = await db
        .insert(schema.workoutPlans)
        .values({
          name: plan.name,
          description: plan.description,
          difficulty: plan.difficulty,
          tier: plan.tier,
          // Null userId marks a catalogue plan rather than a user's own.
          userId: null,
        })
        .returning();

      for (const [dayIndex, day] of plan.days.entries()) {
        const [createdDay] = await db
          .insert(schema.workoutDays)
          .values({ planId: createdPlan.id, dayName: day.dayName, orderIndex: dayIndex })
          .returning();

        for (const [exerciseIndex, [name, sets, reps, restSeconds]] of day.exercises.entries()) {
          const exerciseId = exerciseIds.get(name);
          if (!exerciseId) throw new Error(`Seed references unknown exercise "${name}"`);

          await db.insert(schema.workoutExercises).values({
            dayId: createdDay.id,
            exerciseId,
            sets,
            reps,
            restSeconds,
            orderIndex: exerciseIndex,
          });
        }
      }
      counts.workoutPlans += 1;
    }

    for (const badge of BADGES) {
      const existing = await db.query.badges.findFirst({ where: eq(schema.badges.name, badge.name) });
      if (existing) continue;
      await db.insert(schema.badges).values(badge);
      counts.badges += 1;
    }

    // The curated coaches of the spec's Phase 1, with the programs they own.
    // Independent of the exercise library above — a coach's programs are
    // structured into weeks and days, and carry no exercise rows of their own.
    const coachCounts = await seedCoaches(db);
    counts.coaches = coachCounts.coaches;
    counts.coachPrograms = coachCounts.programs;

    const foodCounts = await seedFoods(db);
    counts.foods = foodCounts.foods;
    counts.foodTranslations = foodCounts.translations;
    counts.foodServings = foodCounts.servings;

    console.log('Seed complete:');
    console.log(`  subscription plans added: ${counts.plans}`);
    console.log(`  exercise categories:      ${counts.categories}`);
    console.log(`  muscles added:            ${counts.muscles}`);
    console.log(`  equipment added:          ${counts.equipment}`);
    console.log(`  exercises added:          ${counts.exercises}`);
    console.log(`  workout plans added:      ${counts.workoutPlans}`);
    console.log(`  badges added:             ${counts.badges}`);
    console.log(`  coaches added:            ${counts.coaches}`);
    console.log(`  coach programs added:     ${counts.coachPrograms}`);
    console.log(`  foods added:              ${counts.foods}`);
    console.log(`  food translations added:  ${counts.foodTranslations}`);
    console.log(`  food servings added:      ${counts.foodServings}`);
  } finally {
    await pool.end();
  }
}

main().catch((error) => {
  console.error('Seed failed:', error);
  process.exit(1);
});
