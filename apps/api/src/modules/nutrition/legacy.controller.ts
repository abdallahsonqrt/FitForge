import { Body, Controller, Get, Param, Post } from '@nestjs/common';
import { z } from 'zod';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { ZodValidationPipe } from '../../common/pipes/zod-validation.pipe';
import { isDateKey } from '../../common/pipes/parse-date-param.pipe';
import { NutritionChatService } from './nutrition-chat.service';
import { MealLogService } from './meal-log.service';
import { LegacyLogMealDto, legacyLogMealSchema, dateSchema } from './dto/log-meal.dto';
import { ChatDto, chatSchema } from './dto/chat.dto';

/**
 * Compatibility routes for the shipped mobile client.
 *
 * `/meals` and `/ai/meals/*` predate the `/nutrition/*` API and are still what
 * the released app calls. They are thin adapters over the same services — no
 * logic lives here — so both surfaces stay consistent, and this file can be
 * deleted outright once the clients have moved over.
 */

interface AuthUser {
  id: string;
  language?: string | null;
}

/** The old request body: `text` where the new API takes `message`. */
const legacyChatSchema = chatSchema
  .omit({ message: true })
  .extend({ text: chatSchema.shape.message });

type LegacyChatDto = z.infer<typeof legacyChatSchema>;

@Controller('meals')
export class LegacyMealsController {
  constructor(private readonly log: MealLogService) {}

  /**
   * `GET /meals` — the caller's meals for the last month.
   *
   * Previously returned every meal in the database for every user, which the
   * client then filtered by id. Now scoped server-side; the shape is unchanged,
   * so the client's own filter still passes.
   */
  @Get()
  async list(@CurrentUser() user: AuthUser) {
    const to = new Date().toISOString().slice(0, 10);
    const from = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString().slice(0, 10);

    const meals = await this.log.mealsBetween(user.id, from, to);

    return meals.map((meal) => ({
      id: meal.id,
      userId: user.id,
      name: meal.name,
      type: meal.type,
      calories: meal.totals.calories,
      protein: meal.totals.protein,
      carbs: meal.totals.carbs,
      fat: meal.totals.fat,
      date: meal.date,
      createdAt: meal.createdAt,
    }));
  }

  /** `POST /meals` — the calculator screen, which posts totals it computed. */
  @Post()
  async create(
    @CurrentUser() user: AuthUser,
    @Body(new ZodValidationPipe(legacyLogMealSchema)) body: LegacyLogMealDto,
  ) {
    const meal = await this.log.logMacros(user.id, body);

    return {
      id: meal.id,
      userId: user.id,
      name: meal.name,
      type: meal.type,
      ...meal.totals,
      date: meal.date,
      createdAt: meal.createdAt,
    };
  }

  /** `GET /meals/summary/:date` — the day's macro totals. */
  @Get('summary/:date')
  async summary(@CurrentUser() user: AuthUser, @Param('date') date: string) {
    const parsed = dateSchema.safeParse(date);
    // `dateSchema` only checks the shape, so `2026-13-45` passed through to a
    // Postgres `date` comparison and came back as a 500. Impossible dates now
    // fall back to today, which is what this route already did for anything else
    // it could not parse — the shipped client's contract is unchanged.
    const day = parsed.success && isDateKey(parsed.data) ? parsed.data : undefined;

    const { totals } = await this.log.day(user.id, { date: day });

    return {
      calories: totals.calories,
      protein: totals.protein,
      carbs: totals.carbs,
      fat: totals.fat,
    };
  }
}

@Controller('ai/meals')
export class LegacyAiMealsController {
  constructor(
    private readonly chatService: NutritionChatService,
    private readonly log: MealLogService,
  ) {}

  @Post('extract')
  async extract(
    @CurrentUser() user: AuthUser,
    @Body(new ZodValidationPipe(legacyChatSchema)) body: LegacyChatDto,
  ) {
    return this.toLegacyResponse(user, body);
  }

  @Post('conversation')
  async conversation(
    @CurrentUser() user: AuthUser,
    @Body(new ZodValidationPipe(legacyChatSchema)) body: LegacyChatDto,
  ) {
    return this.toLegacyResponse(user, body);
  }

  /** The caller's conversations — previously every user's. */
  @Get('conversations')
  async conversations(@CurrentUser() user: AuthUser) {
    return this.chatService.listConversations(user.id);
  }

  /**
   * Flatten a chat turn into the old three-case response. The draft's items are
   * dropped here because the released client has nowhere to show them.
   */
  private async toLegacyResponse(user: AuthUser, body: LegacyChatDto) {
    const result = await this.chatService.chat(
      user.id,
      { ...body, message: body.text, autoCommit: true } as ChatDto,
      user.language?.slice(0, 2).toLowerCase(),
    );

    if (result.status === 'logged') {
      return {
        status: 'logged' as const,
        conversationId: result.conversationId,
        meal: {
          name: result.items.map((item) => item.name).join(', ') || 'Meal',
          calories: result.totals.calories,
          protein: result.totals.protein,
          carbs: result.totals.carbs,
          fat: result.totals.fat,
        },
      };
    }

    // Everything short of a logged meal — a question, an empty draft, small talk
    // — maps onto the one case the old client can render.
    return {
      status: 'needs_clarification' as const,
      conversationId: result.conversationId,
      message: result.question
        ? [result.message, ...result.question.options].join('\n• ')
        : result.message,
    };
  }
}
