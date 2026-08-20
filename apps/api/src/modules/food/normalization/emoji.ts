import { FoodCategory } from '../types';

/**
 * Food icons.
 *
 * A picture is what makes a result list scannable — the eye finds 🥚 in a column
 * far faster than it reads "Whole Egg". Emoji rather than an image pipeline
 * because they cost nothing, need no CDN, and are already localised into every
 * platform's own font.
 *
 * Order matters: the first keyword contained in the name wins, so specific terms
 * must precede the general ones they contain ("chicken breast" before "chicken",
 * "sweet potato" before "potato").
 */
const EMOJI_KEYWORDS: [string, string][] = [
  // ── Prepared dishes: matched first, since they contain ingredient words ──
  ['shawarma', '🌯'],
  ['burrito', '🌯'],
  ['wrap', '🌯'],
  ['pizza', '🍕'],
  ['burger', '🍔'],
  ['cheeseburger', '🍔'],
  ['hot dog', '🌭'],
  ['sandwich', '🥪'],
  ['taco', '🌮'],
  ['sushi', '🍣'],
  ['falafel', '🧆'],
  ['kibbeh', '🧆'],
  ['hummus', '🫓'],
  ['french fries', '🍟'],
  ['fries', '🍟'],
  ['salad', '🥗'],
  ['tabbouleh', '🥗'],
  ['fattoush', '🥗'],
  ['soup', '🍲'],
  ['stew', '🍲'],
  ['mulukhiyah', '🍲'],
  ['curry', '🍛'],
  ['kabsa', '🍛'],
  ['maqluba', '🍛'],
  ['biryani', '🍛'],
  ['mansaf', '🍛'],
  ['paella', '🥘'],
  ['noodle', '🍜'],
  ['ramen', '🍜'],
  ['spaghetti', '🍝'],
  ['pasta', '🍝'],
  ['macaroni', '🍝'],
  ['lasagna', '🍝'],

  // ── Sweets ──
  ['kunafa', '🍮'],
  ['knafeh', '🍮'],
  ['baklava', '🍯'],
  ['ice cream', '🍨'],
  ['chocolate', '🍫'],
  ['cookie', '🍪'],
  ['biscuit', '🍪'],
  ['cake', '🍰'],
  ['doughnut', '🍩'],
  ['donut', '🍩'],
  ['candy', '🍬'],
  ['honey', '🍯'],
  ['sugar', '🧂'],
  ['salt', '🧂'],
  ['popcorn', '🍿'],
  ['pancake', '🥞'],
  ['waffle', '🧇'],

  // ── Protein ──
  ['egg white', '🥚'],
  ['egg yolk', '🥚'],
  ['egg', '🥚'],
  ['chicken', '🍗'],
  ['turkey', '🍗'],
  ['poultry', '🍗'],
  ['duck', '🍗'],
  ['bacon', '🥓'],
  ['steak', '🥩'],
  ['beef', '🥩'],
  ['lamb', '🥩'],
  ['pork', '🥩'],
  ['veal', '🥩'],
  ['liver', '🥩'],
  ['meat', '🥩'],
  ['sausage', '🌭'],
  ['shrimp', '🍤'],
  ['prawn', '🍤'],
  ['lobster', '🦞'],
  ['crab', '🦀'],
  ['squid', '🦑'],
  ['octopus', '🐙'],
  ['salmon', '🐟'],
  ['tuna', '🐟'],
  ['fish', '🐟'],

  // ── Dairy ──
  ['cheese', '🧀'],
  ['labneh', '🧀'],
  // Must precede 'butter', which it contains.
  ['peanut butter', '🥜'],
  ['butter', '🧈'],
  ['yogurt', '🥛'],
  ['yoghurt', '🥛'],
  ['milk', '🥛'],
  ['cream', '🥛'],

  // ── Grains ──
  ['rice', '🍚'],
  ['bread', '🍞'],
  ['toast', '🍞'],
  ['pita', '🫓'],
  ['tortilla', '🫓'],
  ['bagel', '🥯'],
  ['croissant', '🥐'],
  ['baguette', '🥖'],
  ['oat', '🥣'],
  ['cereal', '🥣'],
  ['granola', '🥣'],
  ['quinoa', '🌾'],
  ['bulgur', '🌾'],
  ['couscous', '🌾'],
  ['wheat', '🌾'],
  ['flour', '🌾'],

  // ── Produce ──
  ['apple', '🍎'],
  ['banana', '🍌'],
  ['orange', '🍊'],
  ['tangerine', '🍊'],
  ['lemon', '🍋'],
  ['lime', '🍋'],
  ['grape', '🍇'],
  ['strawberr', '🍓'],
  ['blueberr', '🫐'],
  ['cherr', '🍒'],
  ['peach', '🍑'],
  ['pear', '🍐'],
  ['pineapple', '🍍'],
  ['mango', '🥭'],
  ['watermelon', '🍉'],
  ['melon', '🍈'],
  ['kiwi', '🥝'],
  ['coconut', '🥥'],
  ['avocado', '🥑'],
  ['date', '🌴'],
  ['olive', '🫒'],
  ['tomato', '🍅'],
  ['sweet potato', '🍠'],
  ['potato', '🥔'],
  ['carrot', '🥕'],
  ['corn', '🌽'],
  ['maize', '🌽'],
  ['cucumber', '🥒'],
  ['pickle', '🥒'],
  ['broccoli', '🥦'],
  ['lettuce', '🥬'],
  ['cabbage', '🥬'],
  ['spinach', '🥬'],
  ['eggplant', '🍆'],
  ['aubergine', '🍆'],
  ['pepper', '🌶️'],
  ['onion', '🧅'],
  ['garlic', '🧄'],
  ['mushroom', '🍄'],
  ['zucchini', '🥒'],
  ['courgette', '🥒'],

  // ── Legumes & nuts ──
  ['peanut', '🥜'],
  ['almond', '🌰'],
  ['walnut', '🌰'],
  ['pistachio', '🌰'],
  ['cashew', '🌰'],
  ['nut', '🌰'],
  ['bean', '🫘'],
  ['lentil', '🫘'],
  ['chickpea', '🫘'],

  // ── Drinks ──
  ['coffee', '☕'],
  ['espresso', '☕'],
  ['latte', '☕'],
  ['tea', '🍵'],
  ['juice', '🧃'],
  ['smoothie', '🥤'],
  ['soda', '🥤'],
  ['cola', '🥤'],
  ['beer', '🍺'],
  ['wine', '🍷'],
  ['water', '💧'],

  // ── Supplements & fats ──
  ['protein powder', '🥤'],
  ['whey', '🥤'],
  ['creatine', '💊'],
  ['vitamin', '💊'],
  ['supplement', '💊'],
  ['olive oil', '🫒'],
  ['oil', '🫗'],
];

/** Fallback when nothing in the name is recognisable. */
const CATEGORY_EMOJI: Record<FoodCategory, string> = {
  fruits: '🍎',
  vegetables: '🥬',
  meat: '🥩',
  seafood: '🐟',
  dairy: '🥛',
  grains: '🌾',
  snacks: '🍪',
  drinks: '🥤',
  supplements: '💊',
  recipes: '🍲',
  restaurant: '🍽️',
  other: '🍽️',
};

/**
 * Pick an icon for a food. `name` should be the normalised (lowercased) form —
 * matching is a plain substring test.
 */
export const emojiFor = (name: string, category: FoodCategory): string => {
  for (const [keyword, emoji] of EMOJI_KEYWORDS) {
    if (name.includes(keyword)) return emoji;
  }
  return CATEGORY_EMOJI[category];
};
