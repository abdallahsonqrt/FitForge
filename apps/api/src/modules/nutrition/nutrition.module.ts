import { Module } from '@nestjs/common';
import { StreaksModule } from '../streaks/streaks.module';
import { BadgesModule } from '../badges/badges.module';
import { FoodModule } from '../food/food.module';
import { AiLoggerModule } from '../ai-logger/ai-logger.module';
import { NutritionController } from './nutrition.controller';
import { LegacyAiMealsController, LegacyMealsController } from './legacy.controller';
import { NutritionChatService } from './nutrition-chat.service';
import { MealLogService } from './meal-log.service';
import { FoodResolverService } from './food-resolver.service';
import { WaterController } from './water.controller';
import { WaterService } from './water.service';
import { StepsController } from './steps.controller';
import { StepsService } from './steps.service';

/**
 * Nutrition: meals, water and steps.
 *
 * The meal side is four layers, each replaceable on its own —
 *
 *   MealIntentService     (ai-logger)  sentence  -> intent + foods
 *   FoodResolverService                food name -> catalogue entry + grams
 *   MealLogService                     items     -> rows, totals, history
 *   NutritionChatService               the state machine tying them together
 *
 * That ordering is the design. Nutrition figures are produced in the middle
 * layer, from the food catalogue, and the model above it has no way to supply
 * one. Swapping the AI provider touches only `AiLoggerModule`; changing how a
 * portion converts to grams touches only the resolver.
 */
@Module({
  imports: [FoodModule, AiLoggerModule, StreaksModule, BadgesModule],
  controllers: [
    NutritionController,
    LegacyMealsController,
    LegacyAiMealsController,
    WaterController,
    StepsController,
  ],
  providers: [
    NutritionChatService,
    MealLogService,
    FoodResolverService,
    WaterService,
    StepsService,
  ],
  exports: [MealLogService, FoodResolverService, NutritionChatService, WaterService, StepsService],
})
export class NutritionModule {}
