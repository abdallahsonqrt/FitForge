// ─── Nutrition Types ─────────────────────────────────────

export enum MealType {
  BREAKFAST = 'breakfast',
  LUNCH = 'lunch',
  DINNER = 'dinner',
  SNACK = 'snack',
}

export interface Meal {
  id: string;
  userId: string;
  mealType: MealType;
  name: string;
  totalCalories: number;
  totalProtein: number;
  totalCarbs: number;
  totalFat: number;
  loggedDate: string;
  items: MealItem[];
  createdAt: string;
}

export interface MealItem {
  id: string;
  mealId: string;
  name: string;
  quantity: number;
  unit: string;
  calories: number;
  protein: number;
  carbs: number;
  fat: number;
}

export interface MacroSummary {
  date: string;
  totalCalories: number;
  totalProtein: number;
  totalCarbs: number;
  totalFat: number;
  calorieGoal: number;
  proteinGoal: number;
  carbsGoal: number;
  fatGoal: number;
  meals: Meal[];
}

export interface WaterLog {
  id: string;
  userId: string;
  amountMl: number;
  loggedDate: string;
  createdAt: string;
}

export interface StepLog {
  id: string;
  userId: string;
  steps: number;
  loggedDate: string;
  createdAt: string;
}

export interface DailyWaterSummary {
  date: string;
  totalMl: number;
  goalMl: number;
}

export interface DailyStepSummary {
  date: string;
  totalSteps: number;
  goalSteps: number;
}

// ─── AI Conversation Types ──────────────────────────────

export enum AIConversationStatus {
  ACTIVE = 'active',
  COMPLETED = 'completed',
  CANCELLED = 'cancelled',
}

export interface AIMessage {
  role: 'user' | 'assistant';
  content: string;
  timestamp: string;
  extractedMeal?: Partial<Meal>;
}

export interface AIConversation {
  id: string;
  userId: string;
  mealId?: string;
  messages: AIMessage[];
  status: AIConversationStatus;
  createdAt: string;
  updatedAt: string;
}

export interface AIMealExtraction {
  mealType: MealType;
  items: {
    name: string;
    quantity: number;
    unit: string;
    estimatedCalories: number;
    macros: {
      proteinGrams: number;
      carbsGrams: number;
      fatGrams: number;
    };
  }[];
  totalCalories: number;
  confidenceScore: number;
  followUpQuestion?: string;
}
