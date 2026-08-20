import { NodePgDatabase } from 'drizzle-orm/node-postgres';
import { eq } from 'drizzle-orm';
import * as argon2 from 'argon2';
import * as schema from '../schema';

/**
 * The curated Phase 1 coaching roster.
 *
 * These are the same four coaches the mobile landing page shows in
 * `apps/mobile/src/data/landing.ts` — same names, specialties, experience,
 * ratings and prices. The landing page is the first promise the product makes,
 * and a directory that answered with different people would break it the moment
 * a visitor signed up. That file is presentation-only mock data; this is the
 * record behind it.
 *
 * Each coach is a real `users` row with `role: 'coach'` plus a verified
 * `coach_profiles` row, because that is exactly what the API's authorization
 * expects: the role gates the route, the profile id owns the content.
 *
 * Idempotent — the coach is keyed on their email, the profile on the one-per-user
 * constraint, and each program on its name, so re-running fills gaps without
 * duplicating or overwriting edits.
 *
 * The seeded password is a development convenience so these accounts can be
 * signed into locally. It is not a secret and these rows have no business in a
 * production database.
 */

const SEED_PASSWORD = 'CoachDemo123!';

type Goal = (typeof schema.fitnessGoalEnum.enumValues)[number];
type Level = (typeof schema.experienceLevelEnum.enumValues)[number];
type Location = (typeof schema.trainingLocationEnum.enumValues)[number];

interface SeedWeek {
  weekNumber: number;
  title: string;
  notes: string;
  /** Session names for the week. Exercises are attached by coaches in the app. */
  days: string[];
}

interface SeedProgram {
  name: string;
  description: string;
  difficulty: Level;
  sport: string;
  durationWeeks: number;
  priceCents: number | null;
  targetGoals: Goal[];
  targetLevels: Level[];
  requiredEquipment: string[];
  trainingLocations: Location[];
  weeks: SeedWeek[];
}

interface SeedCoach {
  email: string;
  firstName: string;
  lastName: string;
  headline: string;
  bio: string;
  specialties: string[];
  supportedGoals: Goal[];
  supportedLevels: Level[];
  supportedEquipment: string[];
  trainingLocations: Location[];
  languages: string[];
  timezone: string;
  yearsExperience: number;
  credentials: { name: string; issuer: string; year: number }[];
  responseTimeHours: number;
  monthlyPriceCents: number;
  clientCapacity: number;
  ratingAvg: number;
  ratingCount: number;
  programs: SeedProgram[];
}

const COACHES: SeedCoach[] = [
  {
    // landing.ts → 'jake-morgan', "Calisthenics & home strength", 8 years, 4.9, from $29/mo
    email: 'jake.morgan@fitforge.coach',
    firstName: 'Jake',
    lastName: 'Morgan',
    headline: 'Calisthenics coach — from your first pull-up to the muscle-up',
    bio: 'Build practical strength and master bodyweight skills without a crowded gym. I coach the progressions properly, so the first rep and the hundredth both look like they should. Most of my clients train at home with a bar and a set of bands.',
    specialties: ['calisthenics', 'bodyweight-strength', 'home-training', 'skill-work'],
    supportedGoals: ['muscle_gain', 'maintenance', 'weight_loss'],
    supportedLevels: ['beginner', 'intermediate', 'advanced'],
    supportedEquipment: ['pull-up-bar', 'parallel-bars', 'bodyweight'],
    trainingLocations: ['home', 'outdoors'],
    languages: ['en'],
    timezone: 'Europe/London',
    yearsExperience: 8,
    credentials: [
      { name: 'Certified Personal Trainer', issuer: 'NASM', year: 2018 },
      { name: 'Calisthenics Coach Level 2', issuer: 'World Calisthenics Organization', year: 2020 },
    ],
    responseTimeHours: 24,
    monthlyPriceCents: 2900,
    clientCapacity: 40,
    ratingAvg: 4.9,
    ratingCount: 128,
    programs: [
      {
        name: 'First Pull-Up in 8 Weeks',
        description: 'A patient, progression-led route to your first strict pull-up. Bar and bands only — no gym, no shortcuts, and no reps you have not earned.',
        difficulty: 'beginner',
        sport: 'calisthenics',
        durationWeeks: 8,
        priceCents: null,
        targetGoals: ['muscle_gain', 'maintenance'],
        targetLevels: ['beginner'],
        requiredEquipment: ['pull-up-bar', 'bodyweight'],
        trainingLocations: ['home', 'outdoors'],
        weeks: [
          { weekNumber: 1, title: 'Hang and brace', notes: 'Learn the hollow position and build grip endurance. Quality over volume this week.', days: ['Day 1: Hangs & scapular pulls', 'Day 2: Push and core', 'Day 3: Row practice'] },
          { weekNumber: 2, title: 'Rows that count', notes: 'Horizontal pulling is the base for everything above it. Slow the lowering down.', days: ['Day 1: Inverted rows', 'Day 2: Push and core', 'Day 3: Band-assisted pulls'] },
          { weekNumber: 3, title: 'Negatives', notes: 'Five seconds down, every rep. This is where the strength actually arrives.', days: ['Day 1: Pull-up negatives', 'Day 2: Push and core', 'Day 3: Rows & holds'] },
          { weekNumber: 4, title: 'Deload', notes: 'Half the volume, all of the technique. Do not skip this — it is what makes week 5 work.', days: ['Day 1: Light hangs', 'Day 2: Mobility & core'] },
        ],
      },
      {
        name: 'Home Strength Foundations',
        description: 'Twelve weeks of full-body bodyweight training for people with a bar, a bit of floor space, and no interest in a gym membership.',
        difficulty: 'intermediate',
        sport: 'calisthenics',
        durationWeeks: 12,
        priceCents: null,
        targetGoals: ['muscle_gain', 'weight_loss'],
        targetLevels: ['beginner', 'intermediate'],
        requiredEquipment: ['pull-up-bar', 'bodyweight', 'parallel-bars'],
        trainingLocations: ['home'],
        weeks: [
          { weekNumber: 1, title: 'Movement audit', notes: 'We find out what you can do now, honestly, before we load anything.', days: ['Day 1: Push', 'Day 2: Pull', 'Day 3: Legs & core'] },
          { weekNumber: 2, title: 'Base volume', notes: 'Same movements, more of them. Log every set so we can see the trend.', days: ['Day 1: Push', 'Day 2: Pull', 'Day 3: Legs & core'] },
          { weekNumber: 3, title: 'First progressions', notes: 'Harder variations on the movements you own. Nothing new that you cannot control.', days: ['Day 1: Push', 'Day 2: Pull', 'Day 3: Legs & core'] },
        ],
      },
    ],
  },
  {
    // landing.ts → 'maya-hassan', "Strength & body recomposition", 7 years, 5.0, from $39/mo
    email: 'maya.hassan@fitforge.coach',
    firstName: 'Maya',
    lastName: 'Hassan',
    headline: 'Strength & body recomposition — get stronger, eat enough',
    bio: 'A supportive, structured approach to getting stronger and feeling at home in your body. I pair a straightforward lifting plan with nutrition you can actually live with, and I will not put you on a crash deficit to hit a number faster.',
    specialties: ['strength', 'body-recomposition', 'nutrition', 'bodybuilding'],
    supportedGoals: ['muscle_gain', 'weight_loss', 'maintenance'],
    supportedLevels: ['beginner', 'intermediate', 'advanced'],
    supportedEquipment: ['barbell', 'dumbbells', 'bench', 'cable-machine', 'machine'],
    trainingLocations: ['gym'],
    languages: ['en', 'ar'],
    timezone: 'Africa/Cairo',
    yearsExperience: 7,
    credentials: [
      { name: 'Certified Strength and Conditioning Specialist', issuer: 'NSCA', year: 2019 },
      { name: 'Precision Nutrition Level 1', issuer: 'Precision Nutrition', year: 2021 },
    ],
    responseTimeHours: 12,
    monthlyPriceCents: 3900,
    clientCapacity: 30,
    ratingAvg: 5.0,
    ratingCount: 94,
    programs: [
      {
        name: 'Recomp Foundations',
        description: 'Twelve weeks of full-body lifting with protein targets that fit your week. Built for people who want to lose fat without losing the strength they have.',
        difficulty: 'beginner',
        sport: 'strength',
        durationWeeks: 12,
        priceCents: null,
        targetGoals: ['weight_loss', 'muscle_gain'],
        targetLevels: ['beginner', 'intermediate'],
        requiredEquipment: ['barbell', 'dumbbells', 'bench'],
        trainingLocations: ['gym'],
        weeks: [
          { weekNumber: 1, title: 'Learn the lifts', notes: 'Light loads, full range. We are buying technique now to spend it in week 6.', days: ['Day 1: Full body A', 'Day 2: Full body B', 'Day 3: Full body C'] },
          { weekNumber: 2, title: 'Add load', notes: 'Same sessions, a little heavier. Leave two reps in reserve on every set.', days: ['Day 1: Full body A', 'Day 2: Full body B', 'Day 3: Full body C'] },
          { weekNumber: 3, title: 'Volume up', notes: 'An extra set on the main lifts. Watch your sleep — this is where it starts to matter.', days: ['Day 1: Full body A', 'Day 2: Full body B', 'Day 3: Full body C'] },
          { weekNumber: 4, title: 'Deload & check-in', notes: 'Lighter week, measurements, and an honest look at the food log.', days: ['Day 1: Light full body', 'Day 2: Light full body'] },
        ],
      },
      {
        name: 'Upper/Lower Strength Block',
        description: 'An eight-week four-day split for lifters past their first year, focused on adding weight to the bar without adding hours to the week.',
        difficulty: 'intermediate',
        sport: 'strength',
        durationWeeks: 8,
        priceCents: 4900,
        targetGoals: ['muscle_gain', 'maintenance'],
        targetLevels: ['intermediate', 'advanced'],
        requiredEquipment: ['barbell', 'dumbbells', 'bench', 'cable-machine'],
        trainingLocations: ['gym'],
        weeks: [
          { weekNumber: 1, title: 'Accumulation', notes: 'Build the working volume. Log every set — the plan adapts to what you actually lift.', days: ['Day 1: Upper heavy', 'Day 2: Lower heavy', 'Day 3: Upper volume', 'Day 4: Lower volume'] },
          { weekNumber: 2, title: 'Accumulation', notes: 'Add a rep per set where last week felt controlled.', days: ['Day 1: Upper heavy', 'Day 2: Lower heavy', 'Day 3: Upper volume', 'Day 4: Lower volume'] },
          { weekNumber: 3, title: 'Intensification', notes: 'Heavier top sets, fewer of them. Warm up properly.', days: ['Day 1: Upper heavy', 'Day 2: Lower heavy', 'Day 3: Upper volume', 'Day 4: Lower volume'] },
        ],
      },
    ],
  },
  {
    // landing.ts → 'daniel-reyes', "Running & endurance", 10 years, 4.9, from $35/mo
    email: 'daniel.reyes@fitforge.coach',
    firstName: 'Daniel',
    lastName: 'Reyes',
    headline: 'Running & endurance — 5K to marathon, at your pace',
    bio: 'Build confident running habits with a plan that meets you at your current pace. Ten years of coaching first-timers and race-day regulars has taught me that almost everyone runs their easy days too hard.',
    specialties: ['running', 'endurance', 'race-prep', 'marathon'],
    supportedGoals: ['endurance', 'weight_loss', 'maintenance'],
    supportedLevels: ['beginner', 'intermediate', 'advanced'],
    supportedEquipment: ['bodyweight'],
    trainingLocations: ['outdoors', 'gym'],
    languages: ['en', 'es'],
    timezone: 'America/Chicago',
    yearsExperience: 10,
    credentials: [
      { name: 'Running Coach Level 2', issuer: 'UESCA', year: 2016 },
      { name: 'Certified Personal Trainer', issuer: 'ACE', year: 2015 },
    ],
    responseTimeHours: 24,
    monthlyPriceCents: 3500,
    clientCapacity: 50,
    ratingAvg: 4.9,
    ratingCount: 176,
    programs: [
      {
        name: 'Couch to 5K, Properly',
        description: 'Nine weeks from walking to running five kilometres without stopping. Run-walk intervals that build, and permission to go slower than you think you should.',
        difficulty: 'beginner',
        sport: 'running',
        durationWeeks: 9,
        priceCents: null,
        targetGoals: ['endurance', 'weight_loss'],
        targetLevels: ['beginner'],
        requiredEquipment: ['bodyweight'],
        trainingLocations: ['outdoors'],
        weeks: [
          { weekNumber: 1, title: 'Run-walk', notes: 'Sixty seconds running, ninety walking. If you can hold a conversation, the pace is right.', days: ['Day 1: Intervals', 'Day 2: Easy walk', 'Day 3: Intervals'] },
          { weekNumber: 2, title: 'Longer reps', notes: 'Ninety seconds running now. Same easy effort, not the same pace.', days: ['Day 1: Intervals', 'Day 2: Easy walk', 'Day 3: Intervals'] },
          { weekNumber: 3, title: 'Continuous minutes', notes: 'First three-minute block. Slow it down before you shorten it.', days: ['Day 1: Intervals', 'Day 2: Strength & mobility', 'Day 3: Intervals'] },
          { weekNumber: 4, title: 'Consolidate', notes: 'No new distance this week. Let the tendons catch up with the lungs.', days: ['Day 1: Intervals', 'Day 2: Easy walk', 'Day 3: Intervals'] },
        ],
      },
      {
        name: 'Half Marathon Build',
        description: 'Sixteen weeks to a half marathon you finish strong, with a long run, a quality session, and easy mileage that stays genuinely easy.',
        difficulty: 'intermediate',
        sport: 'running',
        durationWeeks: 16,
        priceCents: 5900,
        targetGoals: ['endurance'],
        targetLevels: ['intermediate', 'advanced'],
        requiredEquipment: ['bodyweight'],
        trainingLocations: ['outdoors'],
        weeks: [
          { weekNumber: 1, title: 'Base', notes: 'Four runs, all conversational. We are building the engine, not testing it.', days: ['Day 1: Easy', 'Day 2: Strides', 'Day 3: Easy', 'Day 4: Long run'] },
          { weekNumber: 2, title: 'Base', notes: 'Add ten minutes to the long run. Everything else stays put.', days: ['Day 1: Easy', 'Day 2: Strides', 'Day 3: Easy', 'Day 4: Long run'] },
          { weekNumber: 3, title: 'First quality', notes: 'Tempo intervals arrive. Hard but repeatable — you should finish wanting one more.', days: ['Day 1: Easy', 'Day 2: Tempo', 'Day 3: Easy', 'Day 4: Long run'] },
        ],
      },
    ],
  },
  {
    // landing.ts → 'lina-saad', "Boxing conditioning & mobility", 6 years, 4.8, from $32/mo
    email: 'lina.saad@fitforge.coach',
    firstName: 'Lina',
    lastName: 'Saad',
    headline: 'Boxing conditioning & mobility — move sharper, last longer',
    bio: 'Develop powerful conditioning, sharper movement, and a resilient athletic base. Boxing footwork and rounds for the engine, mobility work so the shoulders and hips keep up. No sparring required.',
    specialties: ['boxing', 'conditioning', 'mobility', 'athletic-performance'],
    supportedGoals: ['weight_loss', 'endurance', 'maintenance'],
    supportedLevels: ['beginner', 'intermediate'],
    supportedEquipment: ['bodyweight', 'dumbbells', 'pull-up-bar'],
    trainingLocations: ['home', 'gym'],
    languages: ['en', 'ar', 'fr'],
    timezone: 'Africa/Cairo',
    yearsExperience: 6,
    credentials: [
      { name: 'Boxing Coach Level 1', issuer: 'England Boxing', year: 2020 },
      { name: 'Functional Range Conditioning Mobility Specialist', issuer: 'FRC', year: 2022 },
    ],
    responseTimeHours: 24,
    monthlyPriceCents: 3200,
    clientCapacity: 25,
    ratingAvg: 4.8,
    ratingCount: 61,
    programs: [
      {
        name: 'Boxing Conditioning Base',
        description: 'Six weeks of rounds, footwork and shadow boxing that build a real engine in a living room. Minimal kit, maximum breathing.',
        difficulty: 'beginner',
        sport: 'boxing',
        durationWeeks: 6,
        priceCents: null,
        targetGoals: ['weight_loss', 'endurance'],
        targetLevels: ['beginner', 'intermediate'],
        requiredEquipment: ['bodyweight'],
        trainingLocations: ['home'],
        weeks: [
          { weekNumber: 1, title: 'Stance and rounds', notes: 'Two-minute rounds, one minute rest. Footwork before power, always.', days: ['Day 1: Footwork & rounds', 'Day 2: Conditioning circuit', 'Day 3: Mobility'] },
          { weekNumber: 2, title: 'Combinations', notes: 'Add the one-two. Keep the hands up when you are tired — that is the whole skill.', days: ['Day 1: Combinations', 'Day 2: Conditioning circuit', 'Day 3: Mobility'] },
          { weekNumber: 3, title: 'Longer rounds', notes: 'Three-minute rounds now. Pace the first minute.', days: ['Day 1: Combinations', 'Day 2: Conditioning circuit', 'Day 3: Mobility'] },
        ],
      },
    ],
  },
];

export async function seedCoaches(db: NodePgDatabase<typeof schema>) {
  const counts = { coaches: 0, profiles: 0, programs: 0, weeks: 0, days: 0 };
  // Hashed once: argon2 is deliberately slow, and every seeded coach shares the
  // same development password anyway.
  const passwordHash = await argon2.hash(SEED_PASSWORD);

  for (const coach of COACHES) {
    // ─── The account ────────────────────────────────────────
    let user = await db.query.users.findFirst({ where: eq(schema.users.email, coach.email) });
    if (!user) {
      const [created] = await db
        .insert(schema.users)
        .values({
          email: coach.email,
          passwordHash,
          firstName: coach.firstName,
          lastName: coach.lastName,
          role: 'coach',
          language: coach.languages[0],
          onboardingComplete: true,
        })
        .returning();
      user = created;
      counts.coaches += 1;
    }

    // ─── The storefront ─────────────────────────────────────
    let profile = await db.query.coachProfiles.findFirst({
      where: eq(schema.coachProfiles.userId, user.id),
    });
    if (!profile) {
      const [created] = await db
        .insert(schema.coachProfiles)
        .values({
          userId: user.id,
          headline: coach.headline,
          bio: coach.bio,
          specialties: coach.specialties,
          supportedGoals: coach.supportedGoals,
          supportedLevels: coach.supportedLevels,
          supportedEquipment: coach.supportedEquipment,
          trainingLocations: coach.trainingLocations,
          languages: coach.languages,
          timezone: coach.timezone,
          yearsExperience: coach.yearsExperience,
          credentials: coach.credentials,
          // Phase 1 is a curated roster: these coaches are the ones an admin
          // already reviewed, so they are seeded verified and discoverable.
          verificationStatus: 'verified',
          verifiedAt: new Date(),
          responseTimeHours: coach.responseTimeHours,
          monthlyPriceCents: coach.monthlyPriceCents,
          clientCapacity: coach.clientCapacity,
          acceptingClients: true,
          ratingAvg: coach.ratingAvg,
          ratingCount: coach.ratingCount,
        })
        .returning();
      profile = created;
      counts.profiles += 1;
    }

    // ─── Their programs ─────────────────────────────────────
    for (const program of coach.programs) {
      const existing = await db.query.workoutPlans.findFirst({
        where: eq(schema.workoutPlans.name, program.name),
      });
      // Keyed on name like the catalogue plans in seed.ts. A program that already
      // exists is left exactly as it is, weeks included.
      if (existing) continue;

      const [plan] = await db
        .insert(schema.workoutPlans)
        .values({
          coachId: profile.id,
          userId: null,
          name: program.name,
          description: program.description,
          difficulty: program.difficulty,
          // Coach programs sit behind the coaching tier; the platform tier is
          // what the athlete buys, not the program.
          tier: 'coach',
          visibility: 'published',
          durationWeeks: program.durationWeeks,
          sport: program.sport,
          targetGoals: program.targetGoals,
          targetLevels: program.targetLevels,
          requiredEquipment: program.requiredEquipment,
          trainingLocations: program.trainingLocations,
          priceCents: program.priceCents,
        })
        .returning();
      counts.programs += 1;

      for (const week of program.weeks) {
        const [createdWeek] = await db
          .insert(schema.programWeeks)
          .values({
            planId: plan.id,
            weekNumber: week.weekNumber,
            title: week.title,
            notes: week.notes,
          })
          .returning();
        counts.weeks += 1;

        for (const [index, dayName] of week.days.entries()) {
          await db.insert(schema.workoutDays).values({
            planId: plan.id,
            weekId: createdWeek.id,
            dayName,
            orderIndex: index,
          });
          counts.days += 1;
        }
      }
    }
  }

  return counts;
}
