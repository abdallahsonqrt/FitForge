import { NodePgDatabase } from 'drizzle-orm/node-postgres';
import { eq } from 'drizzle-orm';
import * as schema from '../schema';

/**
 * The exercise library.
 *
 * Seeds the three catalogues first — categories, muscles, equipment — then the
 * exercises that reference them. Every exercise carries the coaching content the
 * exercise screen renders: numbered steps, cues, and the mistakes worth calling
 * out. Media is deliberately absent: videos are uploaded to the bucket by an
 * admin, never seeded as URLs to files that may not exist.
 *
 * Idempotent — each catalogue row is keyed on its slug and each exercise on its
 * own, so re-running fills gaps without duplicating or overwriting edits.
 */

type Region = (typeof schema.bodyRegionEnum.enumValues)[number];
type Difficulty = (typeof schema.difficultyEnum.enumValues)[number];

interface SeedExercise {
  slug: string;
  name: string;
  category: string;
  difficulty: Difficulty;
  description: string;
  primaryMuscles: string[];
  secondaryMuscles: string[];
  equipment: string[];
  instructions: string[];
  tips: string[];
  commonMistakes: string[];
  defaults?: { sets: number; reps: number; rest: number };
}

const CATEGORIES: { slug: string; name: string; description: string }[] = [
  { slug: 'upper-push', name: 'Upper Push', description: 'Pressing movements for the chest, shoulders and triceps.' },
  { slug: 'upper-pull', name: 'Upper Pull', description: 'Rows and pull-ups for the back and biceps.' },
  { slug: 'lower-body', name: 'Lower Body', description: 'Squats, hinges and everything below the waist.' },
  { slug: 'core', name: 'Core', description: 'Bracing and anti-extension work for the midsection.' },
  { slug: 'full-body', name: 'Full Body', description: 'Compound lifts that load the whole system at once.' },
];

const MUSCLES: { slug: string; name: string; scientificName: string; region: Region }[] = [
  { slug: 'chest', name: 'Chest', scientificName: 'Pectoralis major', region: 'upper' },
  { slug: 'upper-back', name: 'Upper Back', scientificName: 'Rhomboids & mid-trapezius', region: 'upper' },
  { slug: 'lats', name: 'Lats', scientificName: 'Latissimus dorsi', region: 'upper' },
  { slug: 'traps', name: 'Traps', scientificName: 'Trapezius', region: 'upper' },
  { slug: 'front-delts', name: 'Front Delts', scientificName: 'Anterior deltoid', region: 'upper' },
  { slug: 'side-delts', name: 'Side Delts', scientificName: 'Lateral deltoid', region: 'upper' },
  { slug: 'rear-delts', name: 'Rear Delts', scientificName: 'Posterior deltoid', region: 'upper' },
  { slug: 'biceps', name: 'Biceps', scientificName: 'Biceps brachii', region: 'upper' },
  { slug: 'triceps', name: 'Triceps', scientificName: 'Triceps brachii', region: 'upper' },
  { slug: 'forearms', name: 'Forearms', scientificName: 'Wrist flexors & extensors', region: 'upper' },
  { slug: 'abs', name: 'Abs', scientificName: 'Rectus abdominis', region: 'core' },
  { slug: 'obliques', name: 'Obliques', scientificName: 'External & internal obliques', region: 'core' },
  { slug: 'lower-back', name: 'Lower Back', scientificName: 'Erector spinae', region: 'core' },
  { slug: 'glutes', name: 'Glutes', scientificName: 'Gluteus maximus', region: 'lower' },
  { slug: 'quads', name: 'Quads', scientificName: 'Quadriceps femoris', region: 'lower' },
  { slug: 'hamstrings', name: 'Hamstrings', scientificName: 'Biceps femoris', region: 'lower' },
  { slug: 'calves', name: 'Calves', scientificName: 'Gastrocnemius & soleus', region: 'lower' },
  { slug: 'hip-flexors', name: 'Hip Flexors', scientificName: 'Iliopsoas', region: 'lower' },
  { slug: 'adductors', name: 'Adductors', scientificName: 'Adductor group', region: 'lower' },
];

const EQUIPMENT: { slug: string; name: string; isBodyweight?: boolean }[] = [
  { slug: 'barbell', name: 'Barbell' },
  { slug: 'dumbbells', name: 'Dumbbells' },
  { slug: 'cable-machine', name: 'Cable machine' },
  { slug: 'machine', name: 'Machine' },
  { slug: 'bench', name: 'Bench' },
  { slug: 'pull-up-bar', name: 'Pull-up bar' },
  { slug: 'parallel-bars', name: 'Parallel bars' },
  { slug: 'bodyweight', name: 'Bodyweight', isBodyweight: true },
];

const EXERCISES: SeedExercise[] = [
  {
    slug: 'bench-press',
    name: 'Bench Press',
    category: 'upper-push',
    difficulty: 'intermediate',
    description: 'The benchmark horizontal press: the most direct way to load the chest, front delts and triceps together.',
    primaryMuscles: ['chest'],
    secondaryMuscles: ['triceps', 'front-delts'],
    equipment: ['barbell', 'bench'],
    instructions: [
      'Lie flat with your eyes directly under the bar and plant both feet.',
      'Grip slightly wider than shoulder-width and pull your shoulder blades together.',
      'Unrack and hold the bar straight over your chest with locked elbows.',
      'Lower to mid-chest with your elbows tucked to roughly 45 degrees.',
      'Press back up and over your shoulders without letting your ribs flare.',
    ],
    tips: [
      'Keep your shoulder blades pinned to the bench for the whole set — it protects the shoulder and shortens the range.',
      'Drive your feet into the floor; the leg drive stabilises the press.',
      'Touch the same point on your chest every rep so the groove stays consistent.',
    ],
    commonMistakes: [
      'Flaring the elbows straight out to the sides, which loads the shoulder joint instead of the chest.',
      'Bouncing the bar off the chest and losing the tension that makes the lift work.',
      'Lifting the hips off the bench to shorten the range — that is a different, easier lift.',
    ],
    defaults: { sets: 4, reps: 8, rest: 120 },
  },
  {
    slug: 'incline-dumbbell-press',
    name: 'Incline Dumbbell Press',
    category: 'upper-push',
    difficulty: 'beginner',
    description: 'An incline press with dumbbells, biased toward the upper chest and free to follow a natural arc.',
    primaryMuscles: ['chest'],
    secondaryMuscles: ['front-delts', 'triceps'],
    equipment: ['dumbbells', 'bench'],
    instructions: [
      'Set the bench to about 30 degrees — steeper turns it into a shoulder press.',
      'Sit back with a dumbbell on each thigh and kick them up to shoulder level.',
      'Press to full extension with the dumbbells tracking slightly inward.',
      'Lower under control until you feel a stretch across the upper chest.',
    ],
    tips: [
      'Keep your wrists stacked over your elbows throughout.',
      'Stop the descent where the stretch is strong but the shoulder stays comfortable.',
    ],
    commonMistakes: [
      'Setting the bench too steep, which shifts the work onto the front delts.',
      'Clanging the dumbbells together at the top and losing tension on the chest.',
    ],
    defaults: { sets: 3, reps: 10, rest: 90 },
  },
  {
    slug: 'push-up',
    name: 'Push-up',
    category: 'upper-push',
    difficulty: 'beginner',
    description: 'A moving plank: the whole body braces while the chest and triceps do the pressing.',
    primaryMuscles: ['chest'],
    secondaryMuscles: ['triceps', 'front-delts', 'abs'],
    equipment: ['bodyweight'],
    instructions: [
      'Start in a plank with your hands under your shoulders and your body in a straight line.',
      'Brace your abs and glutes so the hips stay level.',
      'Lower until your chest is just above the floor.',
      'Press back up to full extension without letting the hips sag.',
    ],
    tips: [
      'Elevate your hands on a bench to scale it down; elevate your feet to scale it up.',
      'Keep your elbows at about 45 degrees to your torso rather than flared wide.',
    ],
    commonMistakes: [
      'Letting the hips drop, which loads the lower back instead of the chest.',
      'Cutting the range short and never getting near the floor.',
    ],
    defaults: { sets: 3, reps: 12, rest: 60 },
  },
  {
    slug: 'pull-up',
    name: 'Pull-up',
    category: 'upper-pull',
    difficulty: 'advanced',
    description: 'The standard vertical pull: bodyweight, full range, and honest about how strong your back is.',
    primaryMuscles: ['lats'],
    secondaryMuscles: ['biceps', 'upper-back', 'forearms'],
    equipment: ['pull-up-bar'],
    instructions: [
      'Hang from the bar with an overhand grip slightly wider than your shoulders.',
      'Set your shoulders down and back before you pull.',
      'Drive your elbows toward your ribs until your chin clears the bar.',
      'Lower under control all the way to a full hang.',
    ],
    tips: [
      'Think about pulling the bar down to you rather than pulling yourself up.',
      'Use a band or the assisted machine to keep the range full while you build strength.',
    ],
    commonMistakes: [
      'Kipping with the legs to get the chin over the bar.',
      'Stopping halfway down, which skips the part of the range that builds the lats.',
    ],
    defaults: { sets: 3, reps: 8, rest: 120 },
  },
  {
    slug: 'barbell-row',
    name: 'Barbell Row',
    category: 'upper-pull',
    difficulty: 'intermediate',
    description: 'A horizontal pull under a hinged torso — thickness for the mid-back, with the spine held rigid throughout.',
    primaryMuscles: ['upper-back', 'lats'],
    secondaryMuscles: ['biceps', 'rear-delts', 'lower-back'],
    equipment: ['barbell'],
    instructions: [
      'Hinge at the hips until your torso is roughly 45 degrees from the floor, back flat.',
      'Hold the bar just outside your knees with a shoulder-width grip.',
      'Row the bar to your lower ribs, leading with the elbows.',
      'Lower under control without letting your spine round.',
    ],
    tips: [
      'Brace as though you are about to be punched; the torso angle should not change during the set.',
      'Pause for a beat at the top to stop momentum from doing the work.',
    ],
    commonMistakes: [
      'Standing more upright with each rep until it becomes a shrug.',
      'Rounding the lower back under a weight that is too heavy.',
    ],
    defaults: { sets: 3, reps: 10, rest: 90 },
  },
  {
    slug: 'lat-pulldown',
    name: 'Lat Pulldown',
    category: 'upper-pull',
    difficulty: 'beginner',
    description: 'A vertical pull with adjustable load — the way to train the pull-up pattern before you can do pull-ups.',
    primaryMuscles: ['lats'],
    secondaryMuscles: ['biceps', 'upper-back'],
    equipment: ['cable-machine'],
    instructions: [
      'Set the thigh pad so your legs are pinned and your hips stay down.',
      'Grip the bar wider than shoulder-width.',
      'Pull it to your upper chest, driving your elbows down and back.',
      'Return slowly until your arms are straight and your lats are stretched.',
    ],
    tips: [
      'Lean back no more than about 15 degrees and keep that angle fixed.',
      'Squeeze the shoulder blades down before the elbows bend.',
    ],
    commonMistakes: [
      'Rocking the whole torso to move the weight.',
      'Pulling the bar behind the neck, which strains the shoulder for no extra benefit.',
    ],
    defaults: { sets: 3, reps: 12, rest: 90 },
  },
  {
    slug: 'overhead-press',
    name: 'Overhead Press',
    category: 'upper-push',
    difficulty: 'intermediate',
    description: 'A strict standing press: shoulders and triceps under load, core holding the whole structure upright.',
    primaryMuscles: ['front-delts'],
    secondaryMuscles: ['triceps', 'side-delts', 'abs'],
    equipment: ['barbell'],
    instructions: [
      'Start with the bar racked on your front delts, hands just outside your shoulders.',
      'Brace your core and squeeze your glutes.',
      'Press overhead, moving your head back slightly to clear a straight bar path.',
      'Lock out with the bar over your midfoot, then lower under control.',
    ],
    tips: [
      'Finish each rep with your biceps beside your ears — that is a true lockout.',
      'Keep the ribs down; arching the lower back is how the press turns into an incline press.',
    ],
    commonMistakes: [
      'Pressing the bar around the head instead of moving the head out of the way.',
      'Using leg drive on a lift that is meant to be strict.',
    ],
    defaults: { sets: 3, reps: 8, rest: 120 },
  },
  {
    slug: 'lateral-raise',
    name: 'Lateral Raise',
    category: 'upper-push',
    difficulty: 'beginner',
    description: 'Isolation for the side delts — the muscle that gives the shoulders their width.',
    primaryMuscles: ['side-delts'],
    secondaryMuscles: ['traps'],
    equipment: ['dumbbells'],
    instructions: [
      'Stand tall with a light dumbbell in each hand and a slight bend in the elbows.',
      'Raise the weights out to the sides until they reach shoulder height.',
      'Pause briefly at the top.',
      'Lower slowly, resisting the whole way down.',
    ],
    tips: [
      'Lead with the elbows, not the hands.',
      'Lighter than you think: this movement is about tension, not load.',
    ],
    commonMistakes: [
      'Swinging the weights up with a hip drive.',
      'Shrugging at the top, which hands the work to the traps.',
    ],
    defaults: { sets: 3, reps: 15, rest: 60 },
  },
  {
    slug: 'bicep-curl',
    name: 'Bicep Curl',
    category: 'upper-pull',
    difficulty: 'beginner',
    description: 'Direct biceps work with the elbows fixed at your sides.',
    primaryMuscles: ['biceps'],
    secondaryMuscles: ['forearms'],
    equipment: ['dumbbells'],
    instructions: [
      'Stand with a dumbbell in each hand, palms facing forward.',
      'Curl the weights while keeping your elbows pinned to your sides.',
      'Squeeze at the top without letting the elbows drift forward.',
      'Lower under control to a full stretch.',
    ],
    tips: [
      'A slower negative is where most of the growth comes from.',
      'Stand with your back against a wall if you catch yourself swinging.',
    ],
    commonMistakes: [
      'Rocking the torso to start each rep.',
      'Letting the elbows travel forward, which turns it into a front raise.',
    ],
    defaults: { sets: 3, reps: 12, rest: 60 },
  },
  {
    slug: 'hammer-curl',
    name: 'Hammer Curl',
    category: 'upper-pull',
    difficulty: 'beginner',
    description: 'A neutral-grip curl that shifts work onto the brachialis and forearms.',
    primaryMuscles: ['biceps'],
    secondaryMuscles: ['forearms'],
    equipment: ['dumbbells'],
    instructions: [
      'Hold the dumbbells with your palms facing each other.',
      'Curl without rotating your wrists.',
      'Keep your elbows still and squeeze at the top.',
      'Lower under control.',
    ],
    tips: ['Alternate arms if it helps you keep the torso still.'],
    commonMistakes: ['Rotating into a normal curl halfway up.'],
    defaults: { sets: 3, reps: 12, rest: 60 },
  },
  {
    slug: 'tricep-pushdown',
    name: 'Tricep Pushdown',
    category: 'upper-push',
    difficulty: 'beginner',
    description: 'Cable isolation for the triceps, with constant tension through the whole range.',
    primaryMuscles: ['triceps'],
    secondaryMuscles: [],
    equipment: ['cable-machine'],
    instructions: [
      'Set the cable at about head height and grip the bar or rope.',
      'Tuck your elbows against your ribs.',
      'Push down until your arms are fully extended.',
      'Return slowly until your forearms are just past parallel.',
    ],
    tips: [
      'Lean forward slightly and hold that position for the whole set.',
      'With a rope, spread the ends apart at the bottom for a stronger contraction.',
    ],
    commonMistakes: [
      'Letting the elbows drift away from the body, which recruits the chest and shoulders.',
      'Using so much weight that the reps become a whole-body dip.',
    ],
    defaults: { sets: 3, reps: 12, rest: 60 },
  },
  {
    slug: 'dips',
    name: 'Dips',
    category: 'upper-push',
    difficulty: 'intermediate',
    description: 'A bodyweight vertical press — triceps and lower chest, with the torso angle deciding which leads.',
    primaryMuscles: ['triceps'],
    secondaryMuscles: ['chest', 'front-delts'],
    equipment: ['parallel-bars'],
    instructions: [
      'Support yourself on the bars with your arms locked out.',
      'Lower until your upper arms are roughly parallel to the floor.',
      'Keep your elbows tracking back rather than flaring out.',
      'Press back up to lockout.',
    ],
    tips: [
      'Stay upright for triceps; lean forward to bias the chest.',
      'Use an assisted machine or a band rather than cutting the range short.',
    ],
    commonMistakes: [
      'Dropping far below parallel, which puts the shoulder in a vulnerable position.',
      'Shrugging up at the top instead of holding the shoulders down.',
    ],
    defaults: { sets: 3, reps: 10, rest: 90 },
  },
  {
    slug: 'back-squat',
    name: 'Back Squat',
    category: 'lower-body',
    difficulty: 'intermediate',
    description: 'The primary lower-body lift: quads and glutes under a loaded bar, braced from the floor up.',
    primaryMuscles: ['quads', 'glutes'],
    secondaryMuscles: ['hamstrings', 'lower-back', 'abs', 'adductors'],
    equipment: ['barbell'],
    instructions: [
      'Set the bar across your upper back, not on your neck.',
      'Unrack, step back, and set your feet shoulder-width with toes slightly out.',
      'Take a breath, brace, and sit down between your hips.',
      'Squat until your hip crease drops below your knee, then drive up through your midfoot.',
    ],
    tips: [
      'Push your knees out in line with your toes on the way down.',
      'Keep your chest proud and the bar stacked over your midfoot the whole way.',
    ],
    commonMistakes: [
      'Letting the knees collapse inward under load.',
      'Rising hips-first, which turns the squat into a good morning.',
      'Cutting the depth as the weight climbs.',
    ],
    defaults: { sets: 4, reps: 8, rest: 150 },
  },
  {
    slug: 'leg-press',
    name: 'Leg Press',
    category: 'lower-body',
    difficulty: 'beginner',
    description: 'Heavy quad work with your back supported — useful volume without the technical demand of a squat.',
    primaryMuscles: ['quads'],
    secondaryMuscles: ['glutes', 'hamstrings'],
    equipment: ['machine'],
    instructions: [
      'Sit with your back and hips flat against the pad.',
      'Place your feet shoulder-width in the middle of the platform.',
      'Lower until your knees reach about 90 degrees.',
      'Press back without locking the knees out hard.',
    ],
    tips: [
      'Higher feet bias the glutes and hamstrings; lower feet bias the quads.',
      'Keep your lower back on the pad — that is what caps a safe depth.',
    ],
    commonMistakes: [
      'Letting the hips curl off the pad at the bottom.',
      'Snapping the knees into lockout at the top.',
    ],
    defaults: { sets: 3, reps: 12, rest: 90 },
  },
  {
    slug: 'romanian-deadlift',
    name: 'Romanian Deadlift',
    category: 'lower-body',
    difficulty: 'intermediate',
    description: 'A hip hinge under load: hamstrings and glutes lengthened, spine held still.',
    primaryMuscles: ['hamstrings', 'glutes'],
    secondaryMuscles: ['lower-back', 'forearms'],
    equipment: ['barbell'],
    instructions: [
      'Stand holding the bar at your hips with soft knees.',
      'Push your hips back and let the bar travel down your legs.',
      'Stop when you feel a strong hamstring stretch, back still flat.',
      'Drive your hips forward to stand tall.',
    ],
    tips: [
      'The knee angle should barely change — this is a hinge, not a squat.',
      'Keep the bar in contact with your legs the whole way down.',
    ],
    commonMistakes: [
      'Rounding the lower back to chase extra range.',
      'Turning it into a squat by bending the knees as the bar drops.',
    ],
    defaults: { sets: 3, reps: 10, rest: 120 },
  },
  {
    slug: 'deadlift',
    name: 'Deadlift',
    category: 'full-body',
    difficulty: 'advanced',
    description: 'A full-body pull from the floor. Nothing else loads the posterior chain quite like it.',
    primaryMuscles: ['glutes', 'hamstrings', 'lower-back'],
    secondaryMuscles: ['lats', 'traps', 'quads', 'forearms'],
    equipment: ['barbell'],
    instructions: [
      'Set up with the bar over your midfoot, shins almost touching.',
      'Hinge down and grip just outside your knees.',
      'Take the slack out of the bar, brace, and set your back flat.',
      'Drive the floor away and stand tall, finishing with hips and knees locked together.',
    ],
    tips: [
      'Squeeze your lats to keep the bar close; a bar that drifts forward is a back that rounds.',
      'Reset your brace between reps rather than bouncing off the floor.',
    ],
    commonMistakes: [
      'Jerking the bar off the floor before the slack is out.',
      'Hyperextending at the top instead of simply standing up.',
      'Letting the hips shoot up first, leaving the back to finish the lift.',
    ],
    defaults: { sets: 4, reps: 5, rest: 180 },
  },
  {
    slug: 'calf-raise',
    name: 'Calf Raise',
    category: 'lower-body',
    difficulty: 'beginner',
    description: 'Direct calf work through the full range the muscle actually has.',
    primaryMuscles: ['calves'],
    secondaryMuscles: [],
    equipment: ['machine'],
    instructions: [
      'Place the balls of your feet on the platform with your heels hanging free.',
      'Rise onto your toes as high as you can.',
      'Pause at the top.',
      'Lower slowly until you feel a deep stretch.',
    ],
    tips: ['Pause a full second at both ends; bouncing turns this into a tendon exercise.'],
    commonMistakes: ['Short, fast reps that never reach a stretch or a squeeze.'],
    defaults: { sets: 4, reps: 15, rest: 45 },
  },
  {
    slug: 'plank',
    name: 'Plank',
    category: 'core',
    difficulty: 'beginner',
    description: 'An isometric hold that teaches the core to resist extension — the job it does in every other lift.',
    primaryMuscles: ['abs'],
    secondaryMuscles: ['obliques', 'front-delts', 'glutes'],
    equipment: ['bodyweight'],
    instructions: [
      'Set your forearms on the floor with elbows under your shoulders.',
      'Extend your legs so you form a straight line from head to heels.',
      'Squeeze your abs and glutes and breathe steadily.',
      'Hold for time without letting the hips drift.',
    ],
    tips: [
      'Tuck the pelvis slightly so the lower back stays flat.',
      'Quality over duration: a hard 30 seconds beats a sagging two minutes.',
    ],
    commonMistakes: [
      'Letting the hips sag toward the floor.',
      'Piking the hips up to make the hold easier.',
      'Holding your breath.',
    ],
    defaults: { sets: 3, reps: 30, rest: 60 },
  },
  {
    slug: 'hanging-leg-raise',
    name: 'Hanging Leg Raise',
    category: 'core',
    difficulty: 'advanced',
    description: 'Lower-ab work from a dead hang, with the grip and lats holding you steady.',
    primaryMuscles: ['abs'],
    secondaryMuscles: ['hip-flexors', 'forearms', 'obliques'],
    equipment: ['pull-up-bar'],
    instructions: [
      'Hang from the bar with your shoulders active, not slack.',
      'Raise your legs to hip height or above, curling the pelvis up at the top.',
      'Pause briefly.',
      'Lower slowly without swinging.',
    ],
    tips: [
      'Bend the knees to scale it down while keeping the same pelvic tilt.',
      'The last few degrees — curling the hips — are what make it an ab exercise rather than a hip-flexor one.',
    ],
    commonMistakes: [
      'Swinging between reps and letting momentum do the lifting.',
      'Stopping at 90 degrees without ever curling the pelvis.',
    ],
    defaults: { sets: 3, reps: 12, rest: 60 },
  },
];

export interface ExerciseSeedResult {
  categories: number;
  muscles: number;
  equipment: number;
  exercises: number;
  /** Exercise id by name, so the workout-plan seed can reference lifts by name. */
  exerciseIds: Map<string, string>;
}

export async function seedExerciseLibrary(
  db: NodePgDatabase<typeof schema>,
): Promise<ExerciseSeedResult> {
  const result: ExerciseSeedResult = {
    categories: 0,
    muscles: 0,
    equipment: 0,
    exercises: 0,
    exerciseIds: new Map(),
  };

  // ─── Catalogues ───────────────────────────────────────────
  const categoryIds = new Map<string, string>();
  for (const [index, category] of CATEGORIES.entries()) {
    const existing = await db.query.exerciseCategories.findFirst({
      where: eq(schema.exerciseCategories.slug, category.slug),
    });
    if (existing) {
      categoryIds.set(category.slug, existing.id);
      continue;
    }

    const [created] = await db
      .insert(schema.exerciseCategories)
      .values({ ...category, orderIndex: index })
      .returning();
    categoryIds.set(category.slug, created.id);
    result.categories += 1;
  }

  const muscleIds = new Map<string, string>();
  for (const muscle of MUSCLES) {
    const existing = await db.query.muscles.findFirst({
      where: eq(schema.muscles.slug, muscle.slug),
    });
    if (existing) {
      muscleIds.set(muscle.slug, existing.id);
      continue;
    }

    const [created] = await db.insert(schema.muscles).values(muscle).returning();
    muscleIds.set(muscle.slug, created.id);
    result.muscles += 1;
  }

  const equipmentIds = new Map<string, string>();
  for (const item of EQUIPMENT) {
    const existing = await db.query.equipment.findFirst({
      where: eq(schema.equipment.slug, item.slug),
    });
    if (existing) {
      equipmentIds.set(item.slug, existing.id);
      continue;
    }

    const [created] = await db
      .insert(schema.equipment)
      .values({ ...item, isBodyweight: item.isBodyweight ?? false })
      .returning();
    equipmentIds.set(item.slug, created.id);
    result.equipment += 1;
  }

  // ─── Exercises ────────────────────────────────────────────
  for (const exercise of EXERCISES) {
    const existing = await db.query.exercises.findFirst({
      where: eq(schema.exercises.slug, exercise.slug),
    });
    if (existing) {
      result.exerciseIds.set(exercise.name, existing.id);
      continue;
    }

    const [created] = await db
      .insert(schema.exercises)
      .values({
        slug: exercise.slug,
        name: exercise.name,
        description: exercise.description,
        categoryId: categoryIds.get(exercise.category) ?? null,
        difficulty: exercise.difficulty,
        instructions: exercise.instructions,
        tips: exercise.tips,
        commonMistakes: exercise.commonMistakes,
        defaultSets: exercise.defaults?.sets ?? 3,
        defaultReps: exercise.defaults?.reps ?? 10,
        defaultRestSeconds: exercise.defaults?.rest ?? 90,
      })
      .returning();

    const muscleLinks = [
      ...exercise.primaryMuscles.map((slug, index) => ({ slug, role: 'primary' as const, index })),
      ...exercise.secondaryMuscles.map((slug, index) => ({
        slug,
        role: 'secondary' as const,
        index,
      })),
    ];

    for (const link of muscleLinks) {
      const muscleId = muscleIds.get(link.slug);
      if (!muscleId) throw new Error(`Seed references unknown muscle "${link.slug}"`);

      await db.insert(schema.exerciseMuscles).values({
        exerciseId: created.id,
        muscleId,
        role: link.role,
        orderIndex: link.index,
      });
    }

    for (const [index, slug] of exercise.equipment.entries()) {
      const equipmentId = equipmentIds.get(slug);
      if (!equipmentId) throw new Error(`Seed references unknown equipment "${slug}"`);

      await db.insert(schema.exerciseEquipment).values({
        exerciseId: created.id,
        equipmentId,
        orderIndex: index,
      });
    }

    result.exerciseIds.set(exercise.name, created.id);
    result.exercises += 1;
  }

  return result;
}
