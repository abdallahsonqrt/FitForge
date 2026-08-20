import {
  BadRequestException,
  Controller,
  Delete,
  Get,
  HttpCode,
  Param,
  Post,
  Query,
  Body,
} from '@nestjs/common';
import { ZodType, ZodTypeDef } from 'zod';
import { FoodSearchService } from './food-search.service';
import { FoodCatalogService } from './food-catalog.service';
import { FoodPersonalizationService } from './food-personalization.service';
import { customFoodSchema, CustomFoodDto } from './dto/custom-food.dto';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { ZodValidationPipe } from '../../common/pipes/zod-validation.pipe';
import { FOOD_CATEGORIES, FoodCategory } from './types';
import {
  autocompleteSchema,
  browseCategorySchema,
  foodCategorySchema,
  foodIdSchema,
  listQuerySchema,
  recordUsageSchema,
  RecordUsageDto,
  searchFoodSchema,
} from './dto/search-food.dto';

/** The authenticated user row, as attached by `JwtStrategy`. */
interface AuthUser {
  id: string;
  language?: string | null;
  role?: string | null;
}

@Controller('foods')
export class FoodController {
  constructor(
    private readonly search: FoodSearchService,
    private readonly catalog: FoodCatalogService,
    private readonly personalization: FoodPersonalizationService,
  ) {}

  /**
   * `GET /foods/search?query=chicken&limit=25&language=ar&category=meat`
   *
   * Local-first: the catalogue answers, and only a genuine gap reaches USDA or
   * Open Food Facts — whose answers are then stored, so the next search is local.
   */
  @Get('search')
  async searchFoods(@CurrentUser() user: AuthUser, @Query() query: Record<string, string>) {
    const parsed = this.parse(searchFoodSchema, query);

    return this.search.search({
      query: parsed.query,
      limit: parsed.limit,
      language: this.resolveLanguage(parsed.language, user),
      category: parsed.category,
      userId: user.id,
    });
  }

  /** `GET /foods/autocomplete?query=chi` — prefix suggestions, no network calls. */
  @Get('autocomplete')
  async autocomplete(@CurrentUser() user: AuthUser, @Query() query: Record<string, string>) {
    const parsed = this.parse(autocompleteSchema, query);

    return this.search.autocomplete(
      parsed.query,
      parsed.limit,
      this.resolveLanguage(parsed.language, user),
      user.id,
    );
  }

  /** `GET /foods/categories` — the fixed category list, for filter chips. */
  @Get('categories')
  listCategories() {
    return FOOD_CATEGORIES.map((category) => ({ id: category, label: LABELS[category] }));
  }

  /** `GET /foods/categories/meat?limit=50` */
  @Get('categories/:category')
  async browseCategory(
    @CurrentUser() user: AuthUser,
    @Param('category') category: string,
    @Query() query: Record<string, string>,
  ) {
    const parsedCategory = foodCategorySchema.safeParse(category);
    if (!parsedCategory.success) {
      throw new BadRequestException(`Unknown category "${category}".`);
    }

    const parsed = this.parse(browseCategorySchema, query);

    return this.search.browseCategory(parsedCategory.data as FoodCategory, parsed.limit, {
      language: this.resolveLanguage(parsed.language, user),
      userId: user.id,
    });
  }

  /**
   * `POST /foods/custom` — add a food by hand.
   *
   * The fallback for anything the catalogue and both providers miss: home
   * cooking, a local restaurant dish, and the regional foods USDA has never
   * heard of. An admin sending `shared: true` adds it to the shared catalogue
   * for everyone; anyone else gets a private entry only their own searches see.
   */
  @Post('custom')
  async createCustom(
    @CurrentUser() user: AuthUser,
    @Body(new ZodValidationPipe(customFoodSchema)) body: CustomFoodDto,
  ) {
    const shared = body.shared && user.role === 'admin';

    const id = await this.catalog.createCustom({
      name: body.name,
      brand: body.brand ?? null,
      category: body.category,
      per100g: {
        calories: body.calories ?? 0,
        protein: body.protein,
        carbs: body.carbs,
        fat: body.fat,
        fiber: body.fiber,
        sugar: body.sugar,
        sodium: body.sodium,
      },
      imageUrl: body.imageUrl ?? null,
      servings: body.servings,
      translations: body.translations,
      createdBy: shared ? null : user.id,
      // A shared food is curated by definition; a private one needs no review.
      verified: shared,
    });

    // Cached result sets predate this food; drop them so it is findable now.
    this.search.invalidateCaches();

    return this.search.findById(id, {
      language: this.resolveLanguage(undefined, user),
      userId: user.id,
    });
  }

  /** `GET /foods/custom` — the caller's own custom foods. */
  @Get('custom')
  async listCustom(@CurrentUser() user: AuthUser) {
    return this.search.customFoods(user.id);
  }

  /**
   * `GET /foods/suggestions` — what to show before anything is typed: foods for
   * the current meal slot, favourites, and recents.
   */
  @Get('suggestions')
  async suggestions(@CurrentUser() user: AuthUser, @Query() query: Record<string, string>) {
    const parsed = this.parse(listQuerySchema, query);
    return this.personalization.suggestions(user.id, this.resolveLanguage(parsed.language, user));
  }

  /** `GET /foods/recent?limit=20` */
  @Get('recent')
  async recent(@CurrentUser() user: AuthUser, @Query() query: Record<string, string>) {
    const parsed = this.parse(listQuerySchema, query);
    return this.personalization.recentFoods(
      user.id,
      parsed.limit,
      this.resolveLanguage(parsed.language, user),
    );
  }

  /** `GET /foods/frequent?limit=20` — the user's staples, by usage count. */
  @Get('frequent')
  async frequent(@CurrentUser() user: AuthUser, @Query() query: Record<string, string>) {
    const parsed = this.parse(listQuerySchema, query);
    return this.personalization.frequentFoods(
      user.id,
      parsed.limit,
      this.resolveLanguage(parsed.language, user),
    );
  }

  /** `GET /foods/favorites?limit=20` */
  @Get('favorites')
  async favorites(@CurrentUser() user: AuthUser, @Query() query: Record<string, string>) {
    const parsed = this.parse(listQuerySchema, query);
    return this.personalization.favorites(
      user.id,
      parsed.limit,
      this.resolveLanguage(parsed.language, user),
    );
  }

  /**
   * `GET /foods/:id` — one food with its full serving list.
   *
   * Declared after every literal route above: Nest matches in declaration order,
   * so a `:id` placed earlier would swallow `/foods/recent`.
   */
  @Get(':id')
  async findOne(
    @CurrentUser() user: AuthUser,
    @Param('id') id: string,
    @Query() query: Record<string, string>,
  ) {
    const parsed = this.parse(listQuerySchema, query);

    return this.search.findById(this.parseId(id), {
      language: this.resolveLanguage(parsed.language, user),
      userId: user.id,
    });
  }

  /** `POST /foods/:id/favorite` — idempotent. */
  @Post(':id/favorite')
  async addFavorite(@CurrentUser() user: AuthUser, @Param('id') id: string) {
    return this.personalization.addFavorite(user.id, this.parseId(id));
  }

  @Delete(':id/favorite')
  async removeFavorite(@CurrentUser() user: AuthUser, @Param('id') id: string) {
    return this.personalization.removeFavorite(user.id, this.parseId(id));
  }

  /**
   * `POST /foods/:id/usage` — record that the food was eaten.
   *
   * Feeds recents, meal-time suggestions and the global popularity signal used
   * in ranking. Called by the client after a meal is logged.
   */
  @Post(':id/usage')
  @HttpCode(204)
  async recordUsage(
    @CurrentUser() user: AuthUser,
    @Param('id') id: string,
    @Body(new ZodValidationPipe(recordUsageSchema)) body: RecordUsageDto,
  ): Promise<void> {
    await this.personalization.recordUsage(user.id, this.parseId(id), body.mealType);
  }

  // ─── Internals ────────────────────────────────────────────

  /**
   * Query strings are validated by hand rather than with a pipe: `@Query()`
   * hands over every parameter at once, and reporting the first specific
   * message ("Enter at least two characters") beats a generic 400.
   */
  private parse<T>(schema: ZodType<T, ZodTypeDef, any>, query: unknown): T {
    const parsed = schema.safeParse(query);
    if (!parsed.success) {
      throw new BadRequestException(parsed.error.issues[0].message);
    }
    return parsed.data;
  }

  private parseId(id: string): string {
    const parsed = foodIdSchema.safeParse(id);
    if (!parsed.success) {
      throw new BadRequestException(parsed.error.issues[0].message);
    }
    return parsed.data;
  }

  /**
   * Explicit parameter wins, then the user's profile language. Falling back to
   * `undefined` lets the service detect the language from the query's script,
   * so an Arabic search still reads correctly for a user set to English.
   */
  private resolveLanguage(explicit: string | undefined, user: AuthUser): string | undefined {
    return explicit ?? user.language?.slice(0, 2).toLowerCase() ?? undefined;
  }
}

const LABELS: Record<FoodCategory, string> = {
  fruits: 'Fruits',
  vegetables: 'Vegetables',
  meat: 'Meat',
  seafood: 'Seafood',
  dairy: 'Dairy',
  grains: 'Grains',
  snacks: 'Snacks',
  drinks: 'Drinks',
  supplements: 'Supplements',
  recipes: 'Recipes',
  restaurant: 'Restaurant',
  other: 'Other',
};
