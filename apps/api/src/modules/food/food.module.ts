import { Module } from '@nestjs/common';
import { FoodController } from './food.controller';
import { FoodSearchService } from './food-search.service';
import { FoodCatalogService } from './food-catalog.service';
import { FoodPersonalizationService } from './food-personalization.service';
import { UsdaProvider } from './providers/usda.provider';
import { OpenFoodFactsProvider } from './providers/open-food-facts.provider';
import { SearchCache } from './search/search-cache';

/**
 * Food search.
 *
 * Three services with distinct jobs: `FoodCatalogService` owns the database,
 * `FoodSearchService` owns search policy and external fallback, and
 * `FoodPersonalizationService` owns per-user history and favourites.
 *
 * The search services are exported so the AI nutrition logger can resolve the
 * foods it extracts from natural language against the same catalogue, rather
 * than inventing its own nutrition figures.
 */
@Module({
  controllers: [FoodController],
  providers: [
    FoodCatalogService,
    FoodSearchService,
    FoodPersonalizationService,
    UsdaProvider,
    OpenFoodFactsProvider,
    // A single shared cache instance across all three services, so a favourite
    // change can invalidate the search entries that embed it.
    SearchCache,
  ],
  exports: [FoodSearchService, FoodCatalogService, FoodPersonalizationService],
})
export class FoodModule {}
