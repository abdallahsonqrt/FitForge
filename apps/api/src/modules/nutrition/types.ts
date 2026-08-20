import { MealType } from './dto/log-meal.dto';
import { Nutrients, ServingUnit } from '../food/types';

/**
 * Contracts for conversational meal logging.
 *
 * The split these types enforce is the important one: everything the *model*
 * produces (`ExtractedFood`, `MealEdit`) is language — a name, a number and a
 * unit. Everything with a calorie in it (`DraftItem`) is produced by the backend
 * from the food catalogue. The model never sees a nutrition figure it could be
 * tempted to invent, and no code path lets one of its numbers reach the log.
 */

/** A food as the model understood it. Deliberately carries no nutrition. */
export interface ExtractedFood {
  name: string;
  quantity: number;
  unit: ServingUnit;
  /** Preparation or qualifier the model picked up — "grilled", "with milk". */
  note?: string;
}

/** One operation on the draft, for the editing turns. */
export type MealEdit =
  | { op: 'add'; food: ExtractedFood }
  | { op: 'remove'; target: string }
  | { op: 'set_quantity'; target: string; quantity: number; unit: ServingUnit }
  | { op: 'replace'; target: string; food: ExtractedFood }
  | { op: 'clear' };

/** What the model decided the user is doing. */
export type MealIntent = 'log' | 'edit' | 'repeat' | 'clarify' | 'chat';

/** The model's structured reading of one user message. */
export interface ExtractionResult {
  intent: MealIntent;
  mealType?: MealType;
  foods: ExtractedFood[];
  edits: MealEdit[];
  /** For `repeat`: which past meal to copy. */
  repeat?: { day: 'yesterday' | 'today'; mealType: MealType };
  /** For `clarify`: the question to put to the user. */
  clarification?: { question: string; about: string; options: string[] };
  /** Conversational reply for `chat`, or a confirmation line otherwise. */
  reply?: string;
}

/**
 * A resolved item in the draft: an extracted food matched to the catalogue, with
 * nutrition the backend computed for its weight.
 *
 * Persisted as JSON on the conversation, so it must stay a plain data shape.
 */
export interface DraftItem {
  /** Catalogue id. Null when nothing matched and the item is unresolved. */
  foodId: string | null;
  /** Catalogue name, or the user's phrasing when unresolved. */
  name: string;
  /** Exactly what the user said, kept so edits can target "the toast". */
  spokenName: string;
  quantity: number;
  unit: ServingUnit;
  grams: number;
  servingLabel: string;
  nutrients: Nutrients;
  /** Match confidence, 0–1. Low values are what trigger a confirmation. */
  confidence: number;
}

/** A question the assistant is waiting on an answer to. */
export interface PendingQuestion {
  question: string;
  /** The food it concerns, in the user's words. */
  about: string;
  options: string[];
}

/** Everything a chat turn returns to the client. */
export interface ChatResponse {
  conversationId: string;
  status: 'needs_clarification' | 'draft' | 'logged' | 'chat';
  message: string;
  mealType: MealType;
  items: DraftItem[];
  totals: Nutrients;
  question?: PendingQuestion;
  /** Present once the draft has been committed. */
  mealId?: string;
  /** Items we could not match to any food — surfaced so the user can correct them. */
  unresolved: string[];
}

/** Sum a list of draft items. The only place a meal total is produced. */
export const sumNutrients = (items: { nutrients: Nutrients }[]): Nutrients => {
  const total = items.reduce(
    (acc, item) => ({
      calories: acc.calories + item.nutrients.calories,
      protein: acc.protein + item.nutrients.protein,
      carbs: acc.carbs + item.nutrients.carbs,
      fat: acc.fat + item.nutrients.fat,
      fiber: acc.fiber + item.nutrients.fiber,
      sugar: acc.sugar + item.nutrients.sugar,
      sodium: acc.sodium + item.nutrients.sodium,
    }),
    { calories: 0, protein: 0, carbs: 0, fat: 0, fiber: 0, sugar: 0, sodium: 0 },
  );

  return {
    calories: Math.round(total.calories),
    protein: Math.round(total.protein * 10) / 10,
    carbs: Math.round(total.carbs * 10) / 10,
    fat: Math.round(total.fat * 10) / 10,
    fiber: Math.round(total.fiber * 10) / 10,
    sugar: Math.round(total.sugar * 10) / 10,
    sodium: Math.round(total.sodium * 10) / 10,
  };
};

/** The meal slot a time of day falls in — the default when the user doesn't say. */
export const mealTypeForHour = (hour: number): MealType => {
  if (hour < 11) return 'breakfast';
  if (hour < 16) return 'lunch';
  if (hour < 22) return 'dinner';
  return 'snack';
};

/** A readable name for a meal built from its items. */
export const describeMeal = (items: { name: string }[]): string => {
  if (items.length === 0) return 'Meal';
  if (items.length <= 2) return items.map((item) => item.name).join(' and ');
  return `${items[0].name} and ${items.length - 1} more`;
};
