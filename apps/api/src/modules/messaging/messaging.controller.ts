import {
  Body,
  Controller,
  Get,
  Param,
  ParseUUIDPipe,
  Post,
  Query,
} from '@nestjs/common';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { ZodValidationPipe } from '../../common/pipes/zod-validation.pipe';
import { parseOrThrow } from '../../common/zod/parse-or-throw';
import { MessagingService } from './messaging.service';
import { listMessagesSchema } from './dto/list-messages.dto';
import { SendMessageDto, sendMessageSchema } from './dto/send-message.dto';
import { StartConversationDto, startConversationSchema } from './dto/start-conversation.dto';

/** The authenticated user row, as attached by `JwtStrategy`. */
interface AuthUser {
  id: string;
}

/**
 * `/conversations` — private athlete↔coach threads.
 *
 * There is deliberately no `@Roles` decorator on this controller. Messaging is
 * not gated by role: an athlete signs in as `user` and a coach as `coach`, and
 * both use exactly these routes — which side of a thread the caller is on is
 * read off the conversation row, not off their account. What replaces the role
 * check is stricter: every handler passes the caller's id to the service, which
 * refuses any conversation the caller is not a participant of. No route here
 * takes a participant id from the client, so there is nothing to forge.
 */
@Controller('conversations')
export class MessagingController {
  constructor(private readonly messaging: MessagingService) {}

  /**
   * `GET /conversations` — the caller's inbox, most recent activity first.
   *
   * Each row carries the *other* participant's name and avatar, a preview of the
   * last message, and the caller's unread count for that thread.
   */
  @Get()
  async listConversations(@CurrentUser() user: AuthUser) {
    return this.messaging.listConversations(user.id);
  }

  /**
   * `GET /conversations/unread-count` — the single total behind the tab badge.
   *
   * Declared before `:id` routes so the literal segment is never matched as an id.
   */
  @Get('unread-count')
  async unreadCount(@CurrentUser() user: AuthUser) {
    return this.messaging.unreadCount(user.id);
  }

  /**
   * `POST /conversations` — open the caller's thread with a coach.
   *
   * Idempotent: a pair has one thread for life, so calling this again returns the
   * existing one rather than failing or forking the history.
   */
  @Post()
  async startConversation(
    @CurrentUser() user: AuthUser,
    @Body(new ZodValidationPipe(startConversationSchema)) body: StartConversationDto,
  ) {
    return this.messaging.startConversation(user.id, body);
  }

  /** `GET /conversations/:id/messages?limit=30&cursor=…` — newest first. */
  @Get(':id/messages')
  async listMessages(
    @CurrentUser() user: AuthUser,
    @Param('id', ParseUUIDPipe) id: string,
    @Query() query: Record<string, string>,
  ) {
    return this.messaging.listMessages(user.id, id, parseOrThrow(listMessagesSchema, query));
  }

  /**
   * `POST /conversations/:id/messages` — send.
   *
   * `text` needs a body; `form_review_request` and `form_review_video` need an
   * `attachmentUrl`. `system` and `ai_summary` are refused — those are the
   * platform's to write.
   */
  @Post(':id/messages')
  async sendMessage(
    @CurrentUser() user: AuthUser,
    @Param('id', ParseUUIDPipe) id: string,
    @Body(new ZodValidationPipe(sendMessageSchema)) body: SendMessageDto,
  ) {
    return this.messaging.sendMessage(user.id, id, body);
  }

  /** `POST /conversations/:id/read` — mark the other participant's messages read. */
  @Post(':id/read')
  async markRead(@CurrentUser() user: AuthUser, @Param('id', ParseUUIDPipe) id: string) {
    return this.messaging.markRead(user.id, id);
  }
}
