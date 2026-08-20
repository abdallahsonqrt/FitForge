import {
  BadRequestException,
  Body,
  Controller,
  Delete,
  Get,
  Param,
  ParseUUIDPipe,
  Post,
  Query,
} from '@nestjs/common';
import { ZodType, ZodTypeDef } from 'zod';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { ZodValidationPipe } from '../../common/pipes/zod-validation.pipe';
import { NutritionChatService } from './nutrition-chat.service';
import { MealLogService } from './meal-log.service';
import { ChatDto, chatSchema, CommitDto, commitSchema } from './dto/chat.dto';
import {
  DayQueryDto,
  dayQuerySchema,
  HistoryQueryDto,
  historyQuerySchema,
  LogMealDto,
  logMealSchema,
} from './dto/log-meal.dto';

/** The authenticated user, as attached by `JwtStrategy`. */
interface AuthUser {
  id: string;
  language?: string | null;
}

/**
 * Nutrition logging.
 *
 * `/chat` is the primary way in — the user says what they ate and the meal is
 * resolved, priced and logged. `/log` is the same destination reached by picking
 * foods from the search UI, and every read endpoint serves both equally, since
 * they write the same rows.
 */
@Controller('nutrition')
export class NutritionController {
  constructor(
    private readonly chatService: NutritionChatService,
    private readonly log: MealLogService,
  ) {}

  /**
   * `POST /nutrition/chat` — one conversational turn.
   *
   * Returns the running draft plus a status: `logged` when the meal was saved,
   * `needs_clarification` with a `question` when something was ambiguous, or
   * `draft` when the client asked to confirm before saving.
   */
  @Post('chat')
  async chat(
    @CurrentUser() user: AuthUser,
    @Body(new ZodValidationPipe(chatSchema)) body: ChatDto,
  ) {
    return this.chatService.chat(user.id, body, user.language?.slice(0, 2).toLowerCase());
  }

  /** `POST /nutrition/chat/:id/commit` — save the draft under discussion. */
  @Post('chat/:id/commit')
  async commit(
    @CurrentUser() user: AuthUser,
    @Param('id', new ParseUUIDPipe({ errorHttpStatusCode: 400 })) id: string,
    @Body(new ZodValidationPipe(commitSchema)) body: CommitDto,
  ) {
    return this.chatService.commit(user.id, id, body);
  }

  /** `GET /nutrition/chat/:id` — replay a conversation, for restoring the screen. */
  @Get('chat/:id')
  async conversation(
    @CurrentUser() user: AuthUser,
    @Param('id', new ParseUUIDPipe({ errorHttpStatusCode: 400 })) id: string,
  ) {
    return this.chatService.findConversation(user.id, id);
  }

  /** `GET /nutrition/conversations` — the caller's recent conversations. */
  @Get('conversations')
  async conversations(@CurrentUser() user: AuthUser) {
    return this.chatService.listConversations(user.id);
  }

  /**
   * `POST /nutrition/log` — log a meal from chosen foods.
   *
   * Items reference catalogue ids and portions; the macros are computed here, not
   * accepted from the client.
   */
  @Post('log')
  async logMeal(
    @CurrentUser() user: AuthUser,
    @Body(new ZodValidationPipe(logMealSchema)) body: LogMealDto,
  ) {
    return this.log.log(user.id, body);
  }

  /** `GET /nutrition/today?date=YYYY-MM-DD` — the day's meals and totals. */
  @Get('today')
  async today(@CurrentUser() user: AuthUser, @Query() query: Record<string, string>) {
    return this.log.day(user.id, this.parse(dayQuerySchema, query));
  }

  /** `GET /nutrition/history?from=&to=&limit=` — daily totals and averages. */
  @Get('history')
  async history(@CurrentUser() user: AuthUser, @Query() query: Record<string, string>) {
    return this.log.history(user.id, this.parse(historyQuerySchema, query));
  }

  /** `GET /nutrition/meal/:id` */
  @Get('meal/:id')
  async meal(
    @CurrentUser() user: AuthUser,
    @Param('id', new ParseUUIDPipe({ errorHttpStatusCode: 400 })) id: string,
  ) {
    return this.log.findOne(user.id, id);
  }

  /** `DELETE /nutrition/meal/:id` — the caller's own meals only. */
  @Delete('meal/:id')
  async removeMeal(
    @CurrentUser() user: AuthUser,
    @Param('id', new ParseUUIDPipe({ errorHttpStatusCode: 400 })) id: string,
  ) {
    return this.log.remove(user.id, id);
  }

  // ─── Internals ────────────────────────────────────────────

  /**
   * `@Query()` hands over every parameter at once, so query schemas are parsed by
   * hand: reporting the first specific message beats a generic 400.
   */
  private parse<T>(schema: ZodType<T, ZodTypeDef, any>, query: unknown): T {
    const parsed = schema.safeParse(query);
    if (!parsed.success) {
      throw new BadRequestException(parsed.error.issues[0].message);
    }
    return parsed.data;
  }
}

export type { DayQueryDto, HistoryQueryDto };
