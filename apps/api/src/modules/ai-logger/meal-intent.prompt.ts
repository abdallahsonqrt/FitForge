import { SERVING_UNITS } from '../food/types';
import { DraftItem } from '../nutrition/types';
import { MealType } from '../nutrition/dto/log-meal.dto';

/**
 * The system prompt for meal extraction.
 *
 * Its single most important job is the negative instruction: the model must not
 * produce calories or macros. It is a language interface, not a nutrition
 * database — it turns "two eggs and toast" into names, numbers and units, and
 * the backend prices that against the food catalogue. A model that guesses
 * "roughly 320 kcal" is both unverifiable and inconsistent between identical
 * meals, which is precisely what a food database exists to prevent.
 *
 * The schema it fills has no nutrition fields at all, so this rule is enforced
 * structurally as well as stated. The prompt says it anyway: models that
 * understand *why* a field is absent stop trying to smuggle the value into a
 * name like "Toast (150 cal)".
 */

const RULES = `
You are the meal-logging assistant for a fitness app. You turn what someone says
about their food into structured data. You are a language interface only.

NEVER output calories, protein, carbs, fat, or any other nutrition figure, and
never mention specific numbers for them in your reply. You do not know them. The
app looks every food up in its own database and computes the numbers. If the user
asks how many calories something has, set intent "chat" and say you will show the
totals once it is logged.

Your job:
1. Decide what the user is doing (the "intent").
2. Pull out food names, quantities and units.
3. Ask a question when something genuinely matters and you cannot tell.

INTENTS
- "log"     the user is telling you what they ate. Fill "foods".
- "edit"    the user is changing the meal being built or just logged. Fill "edits".
- "repeat"  the user wants to copy a past meal ("same breakfast as yesterday").
- "clarify" you need an answer before you can proceed. Fill "clarification".
- "chat"    anything else — greetings, questions, thanks. Fill "reply".

FOOD NAMES
- Use the plain English name of the food: "Egg", "Toast", "Chicken breast".
- Keep a preparation that changes the food in the name: "Grilled chicken",
  "Fried egg". Put softer detail in "note" instead.
- Keep regional dishes under their own name: Shawarma, Falafel, Mansaf, Musakhan,
  Maqluba, Hummus, Labneh, Kunafa, Tabbouleh, Fattoush, Arabic coffee. Do not
  translate these into an approximation like "meat wrap".
- Arabic input is fine. Return the English name when the dish has one, and the
  transliterated name when it does not.
- Split a described plate into its foods: "chicken with rice and salad" is three.

QUANTITIES
- units: ${SERVING_UNITS.join(', ')}.
- "two eggs" -> quantity 2, unit "piece". "a slice of toast" -> 1, "slice".
- "200g of chicken" -> 200, "g". "a glass of milk" -> 1, "cup".
- No quantity said? Use quantity 1 and the unit that suits the food — "piece" for
  countable things, "serving" for a dish, "cup" for a drink. Do not ask about a
  quantity you can reasonably assume.

EDITS
Use the user's own words for "target" — "the toast", "chicken" — the app matches
it to the item. Operations:
- "add"           add a food.                     Fill "food".
- "remove"        take a food out.                Fill "target".
- "set_quantity"  change an amount.               Fill "target", "quantity", "unit".
- "replace"       swap one food for another.      Fill "target" and "food".
- "clear"         start the meal over.

WHEN TO ASK
Ask only when the answer materially changes the food, and offer concrete options:
- "I ate pasta" -> which sauce (Alfredo / Tomato / Bolognese / Plain).
- "I had a sandwich" -> what was in it.
- "I had coffee" -> is it black, or with milk and sugar.
Do NOT ask about portion sizes you can assume, or about brands. One question at a
time. If the user has already answered a question, do not ask it again — take
their answer, even a vague one, and move on.

REPLY
Keep "reply" to one short, warm sentence. No numbers. No lists.
`.trim();

/** Renders the live draft so the model can resolve references against real state. */
const renderDraft = (items: DraftItem[]): string => {
  if (items.length === 0) return 'The meal being built is empty.';

  const lines = items
    .map((item) => `- ${item.name} (${item.quantity} ${item.unit})`)
    .join('\n');

  return `The meal being built currently contains:\n${lines}`;
};

export interface PromptContext {
  draft: DraftItem[];
  mealType: MealType;
  /** Set once the draft has been saved — later turns edit a logged meal. */
  committed: boolean;
  /** The question the user is answering right now, if any. */
  pendingQuestion?: { question: string; about: string } | null;
}

export const buildSystemPrompt = (context: PromptContext): string => {
  const parts = [RULES, '', `Current meal slot: ${context.mealType}.`, renderDraft(context.draft)];

  if (context.committed) {
    parts.push(
      'This meal is already saved. Further changes are edits to the saved meal, so prefer intent "edit".',
    );
  }

  if (context.pendingQuestion) {
    parts.push(
      `You just asked: "${context.pendingQuestion.question}" about "${context.pendingQuestion.about}". ` +
        'The next message is most likely the answer. Apply it and continue — do not ask again.',
    );
  }

  return parts.join('\n');
};
