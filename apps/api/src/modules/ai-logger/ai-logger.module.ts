import { Module } from '@nestjs/common';
import { MealIntentService } from './meal-intent.service';

/**
 * The language layer for meal logging.
 *
 * Exports one stateless service and owns no routes. The conversational
 * endpoints live in `NutritionModule`, which combines this understanding step
 * with the food catalogue and the meal log — the arrangement that keeps the
 * model's output from ever reaching the database unpriced.
 */
@Module({
  providers: [MealIntentService],
  exports: [MealIntentService],
})
export class AiLoggerModule {}
