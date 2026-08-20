import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import type { Conversation, Message } from '../../database/schema';
import { isUniqueViolation, MessagingRepository } from './messaging.repository';
import { NotificationsService } from '../notifications/notifications.service';
import { decodeCursor, encodeCursor } from './messaging.cursor';
import {
  ATTACHMENT_MESSAGE_KINDS,
  ConversationSummary,
  ConversationWithParticipants,
  MessageKind,
  MessagePage,
  MessageView,
  PLATFORM_MESSAGE_KINDS,
  PlatformMessageKind,
  toConversationView,
  toMessageView,
  toParticipant,
  USER_MESSAGE_KINDS,
  UserMessageKind,
} from './messaging.types';
import type { ListMessagesDto } from './dto/list-messages.dto';
import type { SendMessageDto } from './dto/send-message.dto';
import type { StartConversationDto } from './dto/start-conversation.dto';

/** What `postPlatformMessage` needs to write a notice into a thread. */
export interface PlatformMessageInput {
  conversationId: string;
  /**
   * The account the message is generated for — an `ai_summary` written for the
   * coach carries the coach. Must be one of the thread's two participants.
   */
  senderUserId: string;
  kind: PlatformMessageKind;
  body?: string | null;
  attachmentUrl?: string | null;
}

const isPlatformKind = (kind: MessageKind): kind is PlatformMessageKind =>
  (PLATFORM_MESSAGE_KINDS as readonly MessageKind[]).includes(kind);

/**
 * Athlete↔coach messaging.
 *
 * Two rules run through everything here.
 *
 * The first is that participation is a fact about a database row, never about
 * the request. Every read and every write loads the conversation and compares
 * the caller against `athlete_user_id` / `coach_user_id`; the caller's side of
 * the thread is derived from that comparison rather than asked for, so there is
 * no parameter a client could set to be treated as someone else, and no route
 * that can return a thread the caller is not on.
 *
 * The second is that `system` and `ai_summary` belong to the platform. They are
 * refused here for every user-originated call and written only through
 * `postPlatformMessage`, which no controller in this module exposes — that is
 * the seam the AI assistant uses to escalate to a coach or file a weekly
 * summary.
 */
@Injectable()
export class MessagingService {
  constructor(
    private readonly repo: MessagingRepository,
    private readonly notifications: NotificationsService,
  ) {}

  // ─── Inbox ────────────────────────────────────────────────

  /** `GET /conversations` — the caller's threads, newest activity first. */
  async listConversations(userId: string): Promise<ConversationSummary[]> {
    const rows = await this.repo.listConversationsForUser(userId);
    return this.assembleSummaries(userId, rows);
  }

  /** `GET /conversations/unread-count` — one total for the tab badge. */
  async unreadCount(userId: string): Promise<{ unreadCount: number }> {
    return { unreadCount: await this.repo.countUnreadTotal(userId) };
  }

  /**
   * `POST /conversations` — the caller's thread with a coach, creating it once.
   *
   * Idempotent by construction: repeated calls return the same row, and so do
   * two calls racing each other.
   */
  async startConversation(
    callerUserId: string,
    dto: StartConversationDto,
  ): Promise<ConversationSummary> {
    const coachUserId = await this.resolveCoachUserId(dto);

    if (coachUserId === callerUserId) {
      throw new BadRequestException('You cannot open a conversation with yourself.');
    }

    const conversation = await this.openConversation(callerUserId, coachUserId);
    return this.summariseOne(callerUserId, conversation);
  }

  // ─── Transcript ───────────────────────────────────────────

  /**
   * `GET /conversations/:id/messages` — a page of transcript, newest first.
   *
   * One row beyond the page is fetched so `hasMore` is known without a count,
   * then dropped before the page is returned.
   */
  async listMessages(
    userId: string,
    conversationId: string,
    query: ListMessagesDto,
  ): Promise<MessagePage> {
    await this.requireParticipant(userId, conversationId);

    const cursor = query.cursor ? decodeCursor(query.cursor) : undefined;
    const rows = await this.repo.listMessages(conversationId, {
      limit: query.limit + 1,
      cursor,
    });

    const hasMore = rows.length > query.limit;
    const page = hasMore ? rows.slice(0, query.limit) : rows;
    const last = page.at(-1);

    return {
      messages: page.map(toMessageView),
      nextCursor: hasMore && last ? encodeCursor(last) : null,
      hasMore,
    };
  }

  /** `POST /conversations/:id/messages` — send, as the caller. */
  async sendMessage(
    userId: string,
    conversationId: string,
    dto: SendMessageDto,
  ): Promise<MessageView> {
    const conversation = await this.requireParticipant(userId, conversationId);

    const kind = this.assertUserKind(dto.kind);
    const payload = this.assertKindPayload(kind, dto);

    const row = await this.repo.insertMessage({
      conversationId,
      senderUserId: userId,
      kind,
      ...payload,
    });

    // Whichever side of the thread did not send it.
    const recipientId =
      conversation.athleteUserId === userId
        ? conversation.coachUserId
        : conversation.athleteUserId;

    // The message is already written. A notification failure must not turn a
    // delivered message into a 500 the client would retry — and duplicate — so
    // this does not depend on `notify` swallowing its own errors.
    await this.notifications
      .notify({
        userId: recipientId,
        title: 'New message',
        message: this.previewOf(kind, payload.body ?? null),
        type: 'message',
      })
      .catch(() => undefined);

    return toMessageView(row);
  }

  /**
   * `POST /conversations/:id/read` — mark the other participant's messages read.
   *
   * The caller's own messages are untouched: read receipts describe what the
   * *other* side has seen, so a sender marking their own rows read would be
   * telling the other participant something that never happened.
   */
  async markRead(userId: string, conversationId: string): Promise<{ readCount: number }> {
    await this.requireParticipant(userId, conversationId);
    return { readCount: await this.repo.markRead(conversationId, userId, new Date()) };
  }

  // ─── Internal API for other modules ───────────────────────

  /**
   * Post a `system` or `ai_summary` message into a thread.
   *
   * The seam the AI assistant escalates through: it summarises a week or hands a
   * question to the coach by writing into the same transcript the two of them
   * already read, so nothing arrives out of context. Exported from
   * `MessagingModule` and deliberately not reachable over HTTP — an end user must
   * not be able to author a message the client renders as coming from the
   * platform.
   */
  async postPlatformMessage(input: PlatformMessageInput): Promise<MessageView> {
    if (!isPlatformKind(input.kind)) {
      throw new BadRequestException(
        `postPlatformMessage writes ${PLATFORM_MESSAGE_KINDS.join(' or ')} messages, not '${input.kind}'.`,
      );
    }

    // The sender is still held to participation: a platform message is attributed
    // to one of the two accounts on the thread, not to an arbitrary user.
    await this.requireParticipant(input.senderUserId, input.conversationId);

    const body = input.body?.trim() ?? '';
    if (!body && !input.attachmentUrl) {
      throw new BadRequestException('A platform message needs a body or an attachment.');
    }

    const row = await this.repo.insertMessage({
      conversationId: input.conversationId,
      senderUserId: input.senderUserId,
      kind: input.kind,
      body: body || null,
      attachmentUrl: input.attachmentUrl ?? null,
    });

    return toMessageView(row);
  }

  /**
   * Get-or-create the single thread for an athlete/coach pair.
   *
   * `conversations` has a unique index on the pair, so this does not check and
   * then insert — the two callers of a first message can interleave between
   * those steps and one of them would get a duplicate-key error at the moment
   * the athlete pressed send. Instead the insert is attempted and the conflict
   * is treated as the ordinary outcome it is: whichever side lost the race
   * re-reads and gets the row the winner created.
   *
   * Exposed for other modules — the AI assistant needs a thread to escalate into
   * and may be the first thing to open one.
   */
  async openConversation(
    athleteUserId: string,
    coachUserId: string,
    enrollmentId?: string | null,
  ): Promise<Conversation> {
    const existing = await this.repo.findConversationByPair(athleteUserId, coachUserId);
    if (existing) return existing;

    const linkedEnrollment =
      enrollmentId === undefined
        ? await this.resolveEnrollmentId(athleteUserId, coachUserId)
        : enrollmentId;

    try {
      const created = await this.repo.insertConversation({
        athleteUserId,
        coachUserId,
        enrollmentId: linkedEnrollment,
      });
      if (created) return created;
    } catch (error) {
      if (!isUniqueViolation(error)) throw error;
    }

    const winner = await this.repo.findConversationByPair(athleteUserId, coachUserId);
    if (!winner) {
      throw new BadRequestException('That conversation could not be opened. Try again.');
    }

    return winner;
  }

  /**
   * The conversation, if and only if `userId` is on it.
   *
   * Public because the check is the module's contract: any other module posting
   * into a thread goes through this before it writes.
   */
  async requireParticipant(userId: string, conversationId: string): Promise<Conversation> {
    const conversation = await this.repo.findConversationById(conversationId);
    if (!conversation) throw new NotFoundException('Conversation not found.');

    if (conversation.athleteUserId !== userId && conversation.coachUserId !== userId) {
      throw new ForbiddenException('You are not a participant in this conversation.');
    }

    return conversation;
  }

  /**
   * What the notification says. Truncated rather than copied whole: the row is a
   * pointer back to the thread, not a second copy of the conversation.
   */
  private previewOf(kind: string, body: string | null): string {
    if (kind !== 'text' || !body) return 'You have a new message.';
    const trimmed = body.trim();
    return trimmed.length > 140 ? trimmed.slice(0, 139) + '…' : trimmed;
  }

  // ─── Internals ────────────────────────────────────────────

  /** Refuse the kinds only the platform may author. */
  private assertUserKind(kind: MessageKind): UserMessageKind {
    if (isPlatformKind(kind)) {
      throw new ForbiddenException(
        `Messages of kind '${kind}' are written by the platform and cannot be sent.`,
      );
    }

    if (!(USER_MESSAGE_KINDS as readonly MessageKind[]).includes(kind)) {
      throw new BadRequestException(`Unknown message kind '${kind}'.`);
    }

    return kind;
  }

  /**
   * What each kind must carry.
   *
   * A `text` message with no body is an empty bubble; a form-review message with
   * no attachment is a request the other side cannot act on. Enforced here
   * rather than in the DTO so internal callers are held to the same rule.
   */
  private assertKindPayload(
    kind: UserMessageKind,
    input: { body?: string | null; attachmentUrl?: string | null },
  ): { body: string | null; attachmentUrl: string | null } {
    const body = input.body?.trim() ?? '';
    const attachmentUrl = input.attachmentUrl?.trim() ?? '';

    if (kind === 'text' && !body) {
      throw new BadRequestException('A text message needs a body.');
    }

    if (ATTACHMENT_MESSAGE_KINDS.includes(kind) && !attachmentUrl) {
      throw new BadRequestException(`A '${kind}' message needs an attachmentUrl.`);
    }

    return { body: body || null, attachmentUrl: attachmentUrl || null };
  }

  /** Accept either id the client might hold, and confirm it really is a coach. */
  private async resolveCoachUserId(dto: StartConversationDto): Promise<string> {
    if (dto.coachId) {
      const userId = await this.repo.findCoachUserIdByProfileId(dto.coachId);
      if (!userId) throw new NotFoundException('Coach not found.');
      return userId;
    }

    const coachUserId = dto.coachUserId as string;
    const profileId = await this.repo.findCoachProfileIdByUserId(coachUserId);
    if (!profileId) throw new NotFoundException('Coach not found.');

    return coachUserId;
  }

  private async resolveEnrollmentId(
    athleteUserId: string,
    coachUserId: string,
  ): Promise<string | null> {
    const coachProfileId = await this.repo.findCoachProfileIdByUserId(coachUserId);
    if (!coachProfileId) return null;

    return this.repo.findLatestEnrollmentId(athleteUserId, coachProfileId);
  }

  private async summariseOne(
    userId: string,
    conversation: Conversation,
  ): Promise<ConversationSummary> {
    const [row] = await this.repo.listConversationsForUser(userId, {
      conversationId: conversation.id,
    });

    // The listing is scoped by `participantOf`, so an empty result here means the
    // caller is not on the thread they just named.
    if (!row) throw new ForbiddenException('You are not a participant in this conversation.');

    const [summary] = await this.assembleSummaries(userId, [row]);
    return summary;
  }

  /**
   * Turn joined conversation rows into inbox rows.
   *
   * The previews and the unread counts are each one query for the whole page
   * rather than one per thread.
   */
  private async assembleSummaries(
    userId: string,
    rows: ConversationWithParticipants[],
  ): Promise<ConversationSummary[]> {
    if (rows.length === 0) return [];

    const ids = rows.map((row) => row.conversation.id);
    const [lastMessages, unreadCounts] = await Promise.all([
      this.repo.findLastMessages(ids),
      this.repo.countUnreadByConversation(userId, ids),
    ]);

    const previews = new Map<string, Message>(
      lastMessages.map((message) => [message.conversationId, message]),
    );
    const unread = new Map<string, number>(
      unreadCounts.map((entry) => [entry.conversationId, entry.unreadCount]),
    );

    return rows.map((row) => {
      const preview = previews.get(row.conversation.id);
      // Which side the caller is on comes from the row, not from the request.
      const callerIsAthlete = row.conversation.athleteUserId === userId;

      return {
        ...toConversationView(row.conversation),
        participant: callerIsAthlete
          ? toParticipant(row.coach, 'coach')
          : toParticipant(row.athlete, 'athlete'),
        lastMessage: preview ? toMessageView(preview) : null,
        unreadCount: unread.get(row.conversation.id) ?? 0,
      };
    });
  }
}
