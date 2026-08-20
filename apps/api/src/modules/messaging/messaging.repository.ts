import { Inject, Injectable } from '@nestjs/common';
import { NodePgDatabase } from 'drizzle-orm/node-postgres';
import { alias } from 'drizzle-orm/pg-core';
import { and, desc, eq, inArray, isNull, lt, ne, or, sql, SQL } from 'drizzle-orm';
import * as schema from '../../database/schema';
import type { Conversation, Message, NewConversation, NewMessage } from '../../database/schema';
import type { ConversationWithParticipants, MessageCursor } from './messaging.types';

/** Postgres `unique_violation` — the pair index rejecting a second thread. */
export const UNIQUE_VIOLATION = '23505';

/**
 * True when `error` is Postgres refusing a duplicate key.
 *
 * Checked through `cause` as well because a driver or pool wrapper may re-throw
 * the original error nested rather than as-is.
 */
export function isUniqueViolation(error: unknown): boolean {
  const code = (error as { code?: unknown } | null)?.code;
  if (code === UNIQUE_VIOLATION) return true;

  const cause = (error as { cause?: unknown } | null)?.cause;
  return Boolean(cause) && (cause as { code?: unknown }).code === UNIQUE_VIOLATION;
}

/**
 * "Rows of a conversation the caller is on."
 *
 * Exported because it is the one predicate authorisation depends on, and it must
 * read identically wherever it is applied — the inbox listing and the total
 * unread badge both narrow to the caller with this and nothing else.
 */
export function participantOf(userId: string): SQL {
  return or(
    eq(schema.conversations.athleteUserId, userId),
    eq(schema.conversations.coachUserId, userId),
  ) as SQL;
}

/**
 * "Messages that are unread *for* `userId`."
 *
 * The `sender_user_id <> $1` half is what stops a participant's own messages
 * inflating their badge; the same predicate drives counting and marking-as-read,
 * so the two can never disagree about which rows are involved.
 */
export function unreadForUser(userId: string): SQL {
  return and(
    ne(schema.messages.senderUserId, userId),
    isNull(schema.messages.readAt),
  ) as SQL;
}

/** Inbox order: most recent activity first, a brand-new empty thread included. */
const lastActivity = sql`coalesce(${schema.conversations.lastMessageAt}, ${schema.conversations.createdAt})`;

/**
 * Every database access messaging makes.
 *
 * Kept apart from `MessagingService` for the same reason `ExercisesRepository`
 * is: the service is where the access rules live, and those rules are easier to
 * trust when the file holding them contains no SQL to read past.
 */
@Injectable()
export class MessagingRepository {
  constructor(@Inject('DB_CONNECTION') private readonly db: NodePgDatabase<typeof schema>) {}

  // ─── Conversations ────────────────────────────────────────

  /**
   * The raw row, with no filtering by caller.
   *
   * Authorisation is the service's decision and is made against the two id
   * columns on this row — never against anything the client sent.
   */
  async findConversationById(conversationId: string): Promise<Conversation | null> {
    const [row] = await this.db
      .select()
      .from(schema.conversations)
      .where(eq(schema.conversations.id, conversationId))
      .limit(1);

    return row ?? null;
  }

  /** The single thread for a pair, if one has ever been opened. */
  async findConversationByPair(
    athleteUserId: string,
    coachUserId: string,
  ): Promise<Conversation | null> {
    const [row] = await this.db
      .select()
      .from(schema.conversations)
      .where(
        and(
          eq(schema.conversations.athleteUserId, athleteUserId),
          eq(schema.conversations.coachUserId, coachUserId),
        ),
      )
      .limit(1);

    return row ?? null;
  }

  /**
   * Insert, yielding to whoever got there first.
   *
   * `onConflictDoNothing` turns the losing side of a concurrent open into an
   * empty result instead of an error; the caller re-reads the pair either way,
   * so both outcomes converge on the one surviving row.
   */
  async insertConversation(values: NewConversation): Promise<Conversation | null> {
    const [row] = await this.db
      .insert(schema.conversations)
      .values(values)
      .onConflictDoNothing()
      .returning();

    return row ?? null;
  }

  /**
   * The caller's threads with both participants joined, newest activity first.
   *
   * Both sides are fetched rather than only "the other one" because which side
   * the caller is on is derived from the row, and the service needs the pair to
   * make that call.
   */
  async listConversationsForUser(
    userId: string,
    options: { conversationId?: string } = {},
  ): Promise<ConversationWithParticipants[]> {
    const athleteUser = alias(schema.users, 'athlete_user');
    const coachUser = alias(schema.users, 'coach_user');

    const conditions: SQL[] = [participantOf(userId)];
    if (options.conversationId) {
      conditions.push(eq(schema.conversations.id, options.conversationId));
    }

    return this.db
      .select({
        conversation: schema.conversations,
        athlete: {
          userId: athleteUser.id,
          firstName: athleteUser.firstName,
          lastName: athleteUser.lastName,
          avatarUrl: athleteUser.avatarUrl,
        },
        coach: {
          userId: coachUser.id,
          firstName: coachUser.firstName,
          lastName: coachUser.lastName,
          avatarUrl: coachUser.avatarUrl,
        },
      })
      .from(schema.conversations)
      .innerJoin(athleteUser, eq(athleteUser.id, schema.conversations.athleteUserId))
      .innerJoin(coachUser, eq(coachUser.id, schema.conversations.coachUserId))
      .where(and(...conditions))
      .orderBy(desc(lastActivity));
  }

  // ─── Messages ─────────────────────────────────────────────

  /**
   * The newest message in each of `conversationIds`, for the inbox preview.
   *
   * `distinct on` gets all of them in one pass; the alternative is a query per
   * row of the inbox, which for a coach with a full client list is dozens.
   */
  async findLastMessages(conversationIds: string[]): Promise<Message[]> {
    if (conversationIds.length === 0) return [];

    return this.db
      .selectDistinctOn([schema.messages.conversationId])
      .from(schema.messages)
      .where(inArray(schema.messages.conversationId, conversationIds))
      .orderBy(
        schema.messages.conversationId,
        desc(schema.messages.createdAt),
        desc(schema.messages.id),
      );
  }

  /** Unread-for-`userId` counts, keyed by conversation. Absent means zero. */
  async countUnreadByConversation(
    userId: string,
    conversationIds: string[],
  ): Promise<{ conversationId: string; unreadCount: number }[]> {
    if (conversationIds.length === 0) return [];

    return this.db
      .select({
        conversationId: schema.messages.conversationId,
        unreadCount: sql<number>`count(*)::int`,
      })
      .from(schema.messages)
      .where(
        and(inArray(schema.messages.conversationId, conversationIds), unreadForUser(userId)),
      )
      .groupBy(schema.messages.conversationId);
  }

  /**
   * One number for the tab badge, across every thread the caller is on.
   *
   * The join to `conversations` is the access control: a message can only be
   * counted through a conversation `participantOf` accepts.
   */
  async countUnreadTotal(userId: string): Promise<number> {
    const [row] = await this.db
      .select({ total: sql<number>`count(*)::int` })
      .from(schema.messages)
      .innerJoin(schema.conversations, eq(schema.conversations.id, schema.messages.conversationId))
      .where(and(participantOf(userId), unreadForUser(userId)));

    return row?.total ?? 0;
  }

  /**
   * A page of transcript, newest first, starting strictly before `cursor`.
   *
   * Returns up to `limit` rows; the service asks for one extra to learn whether
   * another page exists without a second count.
   */
  async listMessages(
    conversationId: string,
    options: { limit: number; cursor?: MessageCursor },
  ): Promise<Message[]> {
    const conditions: SQL[] = [eq(schema.messages.conversationId, conversationId)];

    if (options.cursor) {
      const { createdAt, id } = options.cursor;
      conditions.push(
        or(
          lt(schema.messages.createdAt, createdAt),
          and(eq(schema.messages.createdAt, createdAt), lt(schema.messages.id, id)),
        ) as SQL,
      );
    }

    return this.db
      .select()
      .from(schema.messages)
      .where(and(...conditions))
      .orderBy(desc(schema.messages.createdAt), desc(schema.messages.id))
      .limit(options.limit);
  }

  /**
   * Write the message and move the thread to the top of both inboxes, atomically.
   *
   * `conversations.last_message_at` is denormalised from this table, so a commit
   * that contained only the insert would leave the inbox sorting on a timestamp
   * that no longer matches the transcript.
   */
  async insertMessage(values: NewMessage): Promise<Message> {
    return this.db.transaction(async (tx) => {
      const [row] = await tx.insert(schema.messages).values(values).returning();

      await tx
        .update(schema.conversations)
        .set({ lastMessageAt: row.createdAt })
        .where(eq(schema.conversations.id, values.conversationId));

      return row;
    });
  }

  /**
   * Mark what `readerUserId` has now seen. Returns how many rows changed.
   *
   * Only the *other* participant's messages are touched — `unreadForUser`
   * excludes the reader's own, so a reader can never alter the read receipts on
   * messages they wrote.
   */
  async markRead(conversationId: string, readerUserId: string, at: Date): Promise<number> {
    const updated = await this.db
      .update(schema.messages)
      .set({ readAt: at })
      .where(
        and(eq(schema.messages.conversationId, conversationId), unreadForUser(readerUserId)),
      )
      .returning({ id: schema.messages.id });

    return updated.length;
  }

  // ─── Coach lookups ────────────────────────────────────────

  /** `users.id` behind a directory listing's `coach_profiles.id`. */
  async findCoachUserIdByProfileId(coachProfileId: string): Promise<string | null> {
    const [row] = await this.db
      .select({ userId: schema.coachProfiles.userId })
      .from(schema.coachProfiles)
      .where(eq(schema.coachProfiles.id, coachProfileId))
      .limit(1);

    return row?.userId ?? null;
  }

  /** The coach profile for an account, or null if the account is not a coach. */
  async findCoachProfileIdByUserId(coachUserId: string): Promise<string | null> {
    const [row] = await this.db
      .select({ id: schema.coachProfiles.id })
      .from(schema.coachProfiles)
      .where(eq(schema.coachProfiles.userId, coachUserId))
      .limit(1);

    return row?.id ?? null;
  }

  /**
   * The most recent enrollment joining this athlete to this coach, if any.
   *
   * Recorded on the thread when it is opened so the conversation can be traced
   * back to the relationship that started it. Its absence does not block the
   * thread: an athlete may reasonably ask a coach a question before enrolling.
   */
  async findLatestEnrollmentId(
    athleteUserId: string,
    coachProfileId: string,
  ): Promise<string | null> {
    const [row] = await this.db
      .select({ id: schema.enrollments.id })
      .from(schema.enrollments)
      .where(
        and(
          eq(schema.enrollments.athleteUserId, athleteUserId),
          eq(schema.enrollments.coachId, coachProfileId),
        ),
      )
      .orderBy(desc(schema.enrollments.createdAt))
      .limit(1);

    return row?.id ?? null;
  }
}
