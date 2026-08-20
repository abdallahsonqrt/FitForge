export type Coach = {
  id: string;
  name: string;
  initials: string;
  specialty: string;
  experience: string;
  tags: string[];
  rating: string;
  description: string;
  price: string;
  avatarColors: [string, string];
};

/**
 * A membership tier as the public landing page presents it.
 *
 * `coachAccess` and `responseExpectation` are required, not optional extras:
 * what a tier buys is a level of human coach access, and the product spec asks
 * for the exact coach service and response expectation to be visible before
 * anyone pays. Prices are mock product data while payments are being built.
 */
export type PricingPlan = {
  name: string;
  price: string;
  description: string;
  /** The headline differentiator — what a human does for you at this tier. */
  coachAccess: string;
  /** How quickly, and in what form, that human responds. */
  responseExpectation: string;
  features: string[];
  popular?: boolean;
};

export const featuredCoaches: Coach[] = [
  {
    id: 'jake-morgan', name: 'Jake Morgan', initials: 'JM', specialty: 'Calisthenics & home strength',
    experience: '8 years coaching', tags: ['Pull-up bars', 'Bands', 'Home training'], rating: '4.9',
    description: 'Build practical strength and master bodyweight skills without a crowded gym.', price: 'From $29/mo',
    avatarColors: ['#6C5CE7', '#00D2FF'],
  },
  {
    id: 'maya-hassan', name: 'Maya Hassan', initials: 'MH', specialty: 'Strength & body recomposition',
    experience: '7 years coaching', tags: ['Gym', 'Dumbbells', 'Nutrition'], rating: '5.0',
    description: 'A supportive, structured approach to getting stronger and feeling at home in your body.', price: 'From $39/mo',
    avatarColors: ['#F97316', '#FACC15'],
  },
  {
    id: 'daniel-reyes', name: 'Daniel Reyes', initials: 'DR', specialty: 'Running & endurance',
    experience: '10 years coaching', tags: ['Beginners', '5K to marathon', 'Race prep'], rating: '4.9',
    description: 'Build confident running habits with a plan that meets you at your current pace.', price: 'From $35/mo',
    avatarColors: ['#10B981', '#00D2FF'],
  },
  {
    id: 'lina-saad', name: 'Lina Saad', initials: 'LS', specialty: 'Boxing conditioning & mobility',
    experience: '6 years coaching', tags: ['Home or gym', 'Mobility', 'Conditioning'], rating: '4.8',
    description: 'Develop powerful conditioning, sharper movement, and a resilient athletic base.', price: 'From $32/mo',
    avatarColors: ['#EC4899', '#8B5CF6'],
  },
];

export const pricingPlans: PricingPlan[] = [
  {
    name: 'Free', price: '$0', description: 'A thoughtful place to explore your fit.',
    coachAccess: 'No coach messaging',
    responseExpectation: 'Browse coaches and read their programs. Messaging is not included.',
    features: ['Limited workout preview', 'Basic tracking', 'Browse coaches/programs'],
  },
  {
    name: 'Starter', price: '$9', description: 'Your complete daily training companion.',
    coachAccess: 'No coach messaging',
    responseExpectation: 'Your coach’s full program, guided day to day by the AI assistant. Direct messaging is not included.',
    features: ['Full program access', 'AI workout support', 'Basic nutrition logging', 'Progress tracking'],
  },
  {
    name: 'Coach', price: '$29', description: 'For focused support and a plan that evolves with you.',
    coachAccess: 'Direct coach messaging',
    responseExpectation: 'Message your coach directly — replies within 24 hours on weekdays — plus a scheduled check-in every week.',
    features: ['Everything in Starter', 'Direct coach messaging', 'Scheduled check-ins', 'Personalised plan updates'],
    popular: true,
  },
  {
    name: 'Pro Coaching', price: '$79', description: 'A premium transformation service with your coach close by.',
    coachAccess: 'Priority coach messaging',
    responseExpectation: 'Priority replies within a few hours on weekdays, video form reviews, and deeper nutrition and progress support.',
    features: ['Everything in Coach', 'Priority responses', 'Form reviews', 'Deeper nutrition and progress support'],
  },
];

/**
 * Shown beside the tiers: these prices are mock product data for design and
 * early testing, not a commercial decision, and no payment provider is connected.
 */
export const pricingDisclaimer =
  'Preview pricing. Plans are mock product data while payments are being built — creating an account does not charge you.';
