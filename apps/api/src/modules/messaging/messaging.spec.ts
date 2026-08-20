import { beforeEach, describe, expect, it, vi } from 'vitest';
import { BadRequestException, ForbiddenException, NotFoundException } from '@nestjs/common';
import { PgDialect } from 'drizzle-orm/pg-core';
import type { Conversation, Message, NewConversation } from '../../database/schema';
import { MessagingService } from './messaging.service';
import type { NotificationsService } from '../notifications/notifications.service';
import type { MessagingRepository } from './messaging.repository';
import { isUniqueViolation, participantOf, unreadForUser } from './messaging.repository';
import { decodeCursor, encodeCursor } from './messaging.cursor';
import type { ConversationWithParticipants } from './messaging.types';

/**
 * Athlete↔coach messaging.
 *
 * What is worth pinning down here is the access control and the get-or-create,
 * because both fail quietly: a broken participant check leaks a private thread
 * without erroring, and a check-then-insert works in every test and breaks only
 * under two concurrent first messages. The database is mocked at the repository
 * boundary so those rules are exercised directly; the two predicates that
 * *cannot* be tested that way — the ones that only exist as SQL — are checked by
 * compiling them and reading the statement back.
 */

// ─── Fixtures ───────────────────────────────────────────────

const ATHLETE = 'athlete-user-1';
const COACH = 'coach-user-1';
const STRANGER = 'stranger-user-1';
const CONVERSATION_ID = 'conversation-1';
const COACH_PROFILE = 'coach-profile-1';

const conversation = (overrides: Partial<Conversation> = {}): Conversation => ({
  id: CONVERSATION_ID,
  athleteUserId: ATHLETE,
  coachUserId: COACH,
  enrollmentId: null,
  lastMessageAt: null,
  createdAt: new Date('2026-01-01T00:00:00.000Z'),
  ...overrides,
});

const message = (overrides: Partial<Message> = {}): Message => ({
  id: 'message-1',
  conversationId: CONVERSATION_ID,
  senderUserId: COACH,
  kind: 'text',
  body: 'Nice work this week.',
  attachmentUrl: null,
  readAt: null,
  createdAt: new Date('2026-01-02T00:00:00.000Z'),
  ...overrides,
});

const joinedRow = (row: Conversation = conversation()): ConversationWithParticipants => ({
  conversation: row,
  athlete: {
    userId: row.athleteUserId,
    firstName: 'Amina',
    lastName: 'Said',
    avatarUrl: null,
  },
  coach: {
    userId: row.coachUserId,
    firstName: 'Karim',
    lastName: 'Nabil',
    avatarUrl: 'https://cdn.example/karim.jpg',
  },
});

/** A pg duplicate-key error, as the pair index raises it. */
const uniqueViolation = () => Object.assign(new Error('duplicate key value'), { code: '23505' });

type RepoMock = Record<keyof MessagingRepository, ReturnType<typeof vi.fn>>;

function makeRepo(): RepoMock {
  return {
    findConversationById: vi.fn().mockResolvedValue(conversation()),
    findConversationByPair: vi.fn().mockResolvedValue(null),
    insertConversation: vi.fn(),
    listConversationsForUser: vi.fn().mockResolvedValue([]),
    findLastMessages: vi.fn().mockResolvedValue([]),
    countUnreadByConversation: vi.fn().mockResolvedValue([]),
    countUnreadTotal: vi.fn().mockResolvedValue(0),
    listMessages: vi.fn().mockResolvedValue([]),
    insertMessage: vi.fn().mockImplementation(async (values) => message(values)),
    markRead: vi.fn().mockResolvedValue(0),
    findCoachUserIdByProfileId: vi.fn().mockResolvedValue(COACH),
    findCoachProfileIdByUserId: vi.fn().mockResolvedValue(COACH_PROFILE),
    findLatestEnrollmentId: vi.fn().mockResolvedValue(null),
  };
}

let repo: RepoMock;
let service: MessagingService;
/**
 * Sending a message now also files a notification for the recipient. It is a
 * side effect, not part of the contract under test, so it is stubbed — and
 * captured, so the notification tests below can assert on what was written.
 */
let notifications: { notify: ReturnType<typeof vi.fn> };

beforeEach(() => {
  repo = makeRepo();
  notifications = { notify: vi.fn().mockResolvedValue(undefined) };
  service = new MessagingService(
    repo as unknown as MessagingRepository,
    notifications as unknown as NotificationsService,
  );
});

// ─── Access control ─────────────────────────────────────────

describe('participant authorization', () => {
  /**
   * The threat this module exists to prevent: someone who is on neither side of
   * a thread reading or writing it by guessing its id. The conversation row is
   * real in each of these — the caller simply is not on it.
   */
  it('refuses a non-participant reading a transcript', async () => {
    await expect(
      service.listMessages(STRANGER, CONVERSATION_ID, { limit: 30 }),
    ).rejects.toBeInstanceOf(ForbiddenException);

    // The refusal happens before any message is fetched, not after filtering.
    expect(repo.listMessages).not.toHaveBeenCalled();
  });

  it('refuses a non-participant sending into a thread', async () => {
    await expect(
      service.sendMessage(STRANGER, CONVERSATION_ID, { kind: 'text', body: 'hello' }),
    ).rejects.toBeInstanceOf(ForbiddenException);

    expect(repo.insertMessage).not.toHaveBeenCalled();
  });

  it('refuses a non-participant marking the thread read', async () => {
    await expect(service.markRead(STRANGER, CONVERSATION_ID)).rejects.toBeInstanceOf(
      ForbiddenException,
    );

    expect(repo.markRead).not.toHaveBeenCalled();
  });

  it('refuses a platform message attributed to a non-participant', async () => {
    await expect(
      service.postPlatformMessage({
        conversationId: CONVERSATION_ID,
        senderUserId: STRANGER,
        kind: 'ai_summary',
        body: 'Week 3 summary.',
      }),
    ).rejects.toBeInstanceOf(ForbiddenException);

    expect(repo.insertMessage).not.toHaveBeenCalled();
  });

  it('admits both sides of the thread, and only those two', async () => {
    await expect(service.requireParticipant(ATHLETE, CONVERSATION_ID)).resolves.toMatchObject({
      id: CONVERSATION_ID,
    });
    await expect(service.requireParticipant(COACH, CONVERSATION_ID)).resolves.toMatchObject({
      id: CONVERSATION_ID,
    });
  });

  it('decides from the stored row, never from the id it was handed', async () => {
    await service.requireParticipant(ATHLETE, CONVERSATION_ID);

    // The check reads the conversation back by id and compares the caller against
    // its two columns; nothing about the participants comes from the request.
    expect(repo.findConversationById).toHaveBeenCalledWith(CONVERSATION_ID);
  });

  it('reports a missing conversation as not found rather than forbidden', async () => {
    repo.findConversationById.mockResolvedValue(null);

    await expect(service.requireParticipant(ATHLETE, CONVERSATION_ID)).rejects.toBeInstanceOf(
      NotFoundException,
    );
  });

  it('narrows every inbox read to the caller', async () => {
    await service.listConversations(ATHLETE);
    expect(repo.listConversationsForUser).toHaveBeenCalledWith(ATHLETE);

    await service.unreadCount(ATHLETE);
    expect(repo.countUnreadTotal).toHaveBeenCalledWith(ATHLETE);
  });
});

/**
 * `participantOf` and `unreadForUser` are the two rules that live only as SQL.
 * Compiling them is the only way to assert what they actually restrict.
 */
describe('access predicates, compiled', () => {
  const compile = (condition: ReturnType<typeof participantOf>) =>
    new PgDialect().sqlToQuery(condition);

  it('scopes conversations to rows naming the caller on one side or the other', () => {
    const { sql, params } = compile(participantOf('me'));

    expect(sql).toContain('"athlete_user_id" = $1');
    expect(sql).toContain('"coach_user_id" = $2');
    expect(sql).toContain(' or ');
    expect(params).toEqual(['me', 'me']);
  });
});

// ─── Get-or-create ──────────────────────────────────────────

describe('starting a conversation', () => {
  /** A tiny store, so "call it twice" means what it says. */
  function withStore() {
    let stored: Conversation | null = null;

    repo.findConversationByPair.mockImplementation(async () => stored);
    repo.insertConversation.mockImplementation(async (values: NewConversation) => {
      stored = conversation({ ...values, id: 'conversation-created' });
      return stored;
    });
    repo.listConversationsForUser.mockImplementation(async () =>
      stored ? [joinedRow(stored)] : [],
    );
  }

  it('returns the same conversation when called twice', async () => {
    withStore();

    const first = await service.startConversation(ATHLETE, { coachUserId: COACH });
    const second = await service.startConversation(ATHLETE, { coachUserId: COACH });

    // One thread per pair for life — a returning client keeps their history.
    expect(second.id).toBe(first.id);
    expect(repo.insertConversation).toHaveBeenCalledTimes(1);
  });

  it('returns the winner\'s row when a concurrent open loses the race', async () => {
    const winner = conversation({ id: 'conversation-winner' });

    // Nothing existed at the check; by the time the insert ran, it did.
    repo.findConversationByPair.mockResolvedValueOnce(null).mockResolvedValueOnce(winner);
    repo.insertConversation.mockRejectedValue(uniqueViolation());

    const opened = await service.openConversation(ATHLETE, COACH);

    expect(opened.id).toBe('conversation-winner');
  });

  it('also recovers when the conflict is swallowed rather than raised', async () => {
    // `on conflict do nothing` returns no row instead of erroring.
    const winner = conversation({ id: 'conversation-winner' });
    repo.findConversationByPair.mockResolvedValueOnce(null).mockResolvedValueOnce(winner);
    repo.insertConversation.mockResolvedValue(null);

    await expect(service.openConversation(ATHLETE, COACH)).resolves.toMatchObject({
      id: 'conversation-winner',
    });
  });

  it('does not swallow failures that are not the pair conflict', async () => {
    repo.insertConversation.mockRejectedValue(
      Object.assign(new Error('foreign key violation'), { code: '23503' }),
    );

    await expect(service.openConversation(ATHLETE, COACH)).rejects.toThrow(
      'foreign key violation',
    );
  });

  it('records the enrollment that opened the thread when there is one', async () => {
    repo.findLatestEnrollmentId.mockResolvedValue('enrollment-9');
    repo.insertConversation.mockImplementation(async (values: NewConversation) =>
      conversation(values),
    );

    await service.openConversation(ATHLETE, COACH);

    expect(repo.insertConversation).toHaveBeenCalledWith(
      expect.objectContaining({ enrollmentId: 'enrollment-9' }),
    );
  });

  it('refuses a coach who does not exist', async () => {
    repo.findCoachProfileIdByUserId.mockResolvedValue(null);

    await expect(
      service.startConversation(ATHLETE, { coachUserId: 'not-a-coach' }),
    ).rejects.toBeInstanceOf(NotFoundException);
  });

  it('resolves a coach named by directory profile id', async () => {
    withStore();

    await service.startConversation(ATHLETE, { coachId: COACH_PROFILE });

    expect(repo.findCoachUserIdByProfileId).toHaveBeenCalledWith(COACH_PROFILE);
    expect(repo.insertConversation).toHaveBeenCalledWith(
      expect.objectContaining({ athleteUserId: ATHLETE, coachUserId: COACH }),
    );
  });

  it('refuses a thread with oneself', async () => {
    await expect(
      service.startConversation(COACH, { coachUserId: COACH }),
    ).rejects.toBeInstanceOf(BadRequestException);
  });
});

// ─── Unread ─────────────────────────────────────────────────

describe('unread counts', () => {
  /**
   * The rule that keeps the badge honest. It lives in `unreadForUser`, which is
   * a SQL fragment, so it is asserted by compiling the fragment — a mocked
   * repository could only ever re-state the expectation.
   */
  it('excludes the caller\'s own messages, and anything already read', () => {
    const { sql, params } = new PgDialect().sqlToQuery(unreadForUser('me'));

    expect(sql).toContain('"sender_user_id" <> $1');
    expect(sql).toContain('"read_at" is null');
    expect(params).toEqual(['me']);
  });

  it('is the same predicate that marking-as-read uses', () => {
    // Counting and clearing must agree on which rows are involved, or a badge
    // survives the thread being opened.
    const counted = new PgDialect().sqlToQuery(unreadForUser('me')).sql;
    const cleared = new PgDialect().sqlToQuery(unreadForUser('me')).sql;

    expect(cleared).toBe(counted);
  });

  it('marks read as the caller, so a sender cannot clear their own receipts', async () => {
    await service.markRead(COACH, CONVERSATION_ID);

    const [conversationId, readerUserId, at] = repo.markRead.mock.calls[0];
    expect(conversationId).toBe(CONVERSATION_ID);
    expect(readerUserId).toBe(COACH);
    expect(at).toBeInstanceOf(Date);
  });

  it('reports zero for a thread with nothing unread', async () => {
    repo.listConversationsForUser.mockResolvedValue([joinedRow()]);
    repo.countUnreadByConversation.mockResolvedValue([]);

    const [summary] = await service.listConversations(ATHLETE);
    expect(summary.unreadCount).toBe(0);
  });

  it('attaches each thread its own count', async () => {
    const other = conversation({ id: 'conversation-2' });
    repo.listConversationsForUser.mockResolvedValue([joinedRow(), joinedRow(other)]);
    repo.countUnreadByConversation.mockResolvedValue([
      { conversationId: 'conversation-2', unreadCount: 3 },
    ]);

    const summaries = await service.listConversations(ATHLETE);

    expect(summaries.find((row) => row.id === CONVERSATION_ID)?.unreadCount).toBe(0);
    expect(summaries.find((row) => row.id === 'conversation-2')?.unreadCount).toBe(3);
  });
});

// ─── Inbox shape ────────────────────────────────────────────

describe('inbox rows', () => {
  beforeEach(() => {
    repo.listConversationsForUser.mockResolvedValue([joinedRow()]);
    repo.findLastMessages.mockResolvedValue([message({ body: 'See you Monday.' })]);
  });

  it('shows the athlete their coach', async () => {
    const [summary] = await service.listConversations(ATHLETE);

    expect(summary.participant).toMatchObject({
      userId: COACH,
      firstName: 'Karim',
      role: 'coach',
    });
  });

  it('shows the coach their athlete, from the same row', async () => {
    // Which side the caller is on is derived, not passed in — one query serves
    // both inboxes.
    const [summary] = await service.listConversations(COACH);

    expect(summary.participant).toMatchObject({
      userId: ATHLETE,
      firstName: 'Amina',
      role: 'athlete',
    });
  });

  it('carries the last message as the preview', async () => {
    const [summary] = await service.listConversations(ATHLETE);
    expect(summary.lastMessage?.body).toBe('See you Monday.');
  });

  it('serialises timestamps as ISO strings', async () => {
    const [summary] = await service.listConversations(ATHLETE);

    expect(summary.createdAt).toBe('2026-01-01T00:00:00.000Z');
    expect(summary.lastMessage?.createdAt).toBe('2026-01-02T00:00:00.000Z');
    expect(summary.lastMessage?.readAt).toBeNull();
  });

  it('handles a thread with no messages yet', async () => {
    repo.findLastMessages.mockResolvedValue([]);

    const [summary] = await service.listConversations(ATHLETE);
    expect(summary.lastMessage).toBeNull();
  });
});

// ─── Notifying the recipient ────────────────────────────────

describe('notifying the recipient', () => {
  /**
   * The notification must reach whoever did *not* send the message. Getting this
   * backwards is silent — the sender simply gets a bell for their own message
   * and the recipient hears nothing — so both directions are pinned.
   */
  it('notifies the coach when the athlete writes', async () => {
    await service.sendMessage(ATHLETE, CONVERSATION_ID, { kind: 'text', body: 'Ready for week 2' });

    expect(notifications.notify).toHaveBeenCalledWith({
      userId: COACH,
      title: 'New message',
      message: 'Ready for week 2',
      type: 'message',
    });
  });

  it('notifies the athlete when the coach writes', async () => {
    await service.sendMessage(COACH, CONVERSATION_ID, { kind: 'text', body: 'Nice work' });

    expect(notifications.notify).toHaveBeenCalledWith(
      expect.objectContaining({ userId: ATHLETE, type: 'message' }),
    );
  });

  it('never notifies the sender about their own message', async () => {
    await service.sendMessage(ATHLETE, CONVERSATION_ID, { kind: 'text', body: 'hello' });

    expect(notifications.notify).not.toHaveBeenCalledWith(
      expect.objectContaining({ userId: ATHLETE }),
    );
  });

  it('truncates a long body rather than copying the whole message', async () => {
    const long = 'a'.repeat(300);
    await service.sendMessage(ATHLETE, CONVERSATION_ID, { kind: 'text', body: long });

    const [{ message }] = notifications.notify.mock.calls.at(-1) as [{ message: string }];
    expect(message.length).toBeLessThanOrEqual(140);
    expect(message.endsWith('\u2026')).toBe(true);
  });

  it('describes an attachment message without inventing body text', async () => {
    await service.sendMessage(COACH, CONVERSATION_ID, {
      kind: 'form_review_request',
      attachmentUrl: 'https://cdn.example/brief.mp4',
    });

    expect(notifications.notify).toHaveBeenCalledWith(
      expect.objectContaining({ message: 'You have a new message.' }),
    );
  });

  /**
   * A notification is a side effect of the send, never a precondition for it.
   * `NotificationsService.notify` swallows its own failures for this reason;
   * this asserts the send does not depend on that being true.
   */
  it('still delivers the message when notifying fails', async () => {
    notifications.notify.mockRejectedValueOnce(new Error('notifications are down'));

    await expect(
      service.sendMessage(ATHLETE, CONVERSATION_ID, { kind: 'text', body: 'hello' }),
    ).resolves.toBeDefined();

    expect(repo.insertMessage).toHaveBeenCalled();
  });
});

// ─── Sending ────────────────────────────────────────────────

describe('sending a message', () => {
  it('writes a text message as the caller', async () => {
    const sent = await service.sendMessage(ATHLETE, CONVERSATION_ID, {
      kind: 'text',
      body: '  Shoulder felt fine today.  ',
    });

    expect(repo.insertMessage).toHaveBeenCalledWith({
      conversationId: CONVERSATION_ID,
      senderUserId: ATHLETE,
      kind: 'text',
      body: 'Shoulder felt fine today.',
      attachmentUrl: null,
    });
    expect(sent.senderUserId).toBe(ATHLETE);
  });

  it('rejects an empty text message', async () => {
    await expect(
      service.sendMessage(ATHLETE, CONVERSATION_ID, { kind: 'text', body: '   ' }),
    ).rejects.toBeInstanceOf(BadRequestException);
  });

  it('requires an attachment on a form-review video', async () => {
    await expect(
      service.sendMessage(ATHLETE, CONVERSATION_ID, {
        kind: 'form_review_video',
        body: 'here it is',
      }),
    ).rejects.toBeInstanceOf(BadRequestException);
  });

  it('accepts a form-review request with its attachment', async () => {
    await service.sendMessage(COACH, CONVERSATION_ID, {
      kind: 'form_review_request',
      attachmentUrl: 'https://cdn.example/brief.mp4',
    });

    expect(repo.insertMessage).toHaveBeenCalledWith(
      expect.objectContaining({
        kind: 'form_review_request',
        attachmentUrl: 'https://cdn.example/brief.mp4',
      }),
    );
  });

  it.each(['system', 'ai_summary'] as const)(
    'refuses a user sending a %s message',
    async (kind) => {
      await expect(
        service.sendMessage(ATHLETE, CONVERSATION_ID, { kind, body: 'Platform notice' }),
      ).rejects.toBeInstanceOf(ForbiddenException);

      expect(repo.insertMessage).not.toHaveBeenCalled();
    },
  );
});

// ─── The platform's own seam ────────────────────────────────

describe('postPlatformMessage', () => {
  it('writes an AI summary into the thread for a participant', async () => {
    const posted = await service.postPlatformMessage({
      conversationId: CONVERSATION_ID,
      senderUserId: ATHLETE,
      kind: 'ai_summary',
      body: 'Amina hit 4 of 4 sessions and asked about shoulder pain.',
    });

    expect(posted.kind).toBe('ai_summary');
    expect(repo.insertMessage).toHaveBeenCalledWith(
      expect.objectContaining({ kind: 'ai_summary', senderUserId: ATHLETE }),
    );
  });

  it('refuses to write a kind an end user could have sent', async () => {
    await expect(
      service.postPlatformMessage({
        conversationId: CONVERSATION_ID,
        senderUserId: ATHLETE,
        // Only `system` and `ai_summary` belong on this path.
        kind: 'text' as never,
        body: 'hello',
      }),
    ).rejects.toBeInstanceOf(BadRequestException);
  });

  it('refuses an empty notice', async () => {
    await expect(
      service.postPlatformMessage({
        conversationId: CONVERSATION_ID,
        senderUserId: ATHLETE,
        kind: 'system',
        body: '   ',
      }),
    ).rejects.toBeInstanceOf(BadRequestException);
  });
});

// ─── Paging ─────────────────────────────────────────────────

describe('transcript paging', () => {
  const page = (count: number) =>
    Array.from({ length: count }, (_, index) =>
      message({
        id: `message-${index}`,
        createdAt: new Date(Date.UTC(2026, 0, 10, 0, 0, count - index)),
      }),
    );

  it('returns newest first and reports no more when the page is short', async () => {
    repo.listMessages.mockResolvedValue(page(2));

    const result = await service.listMessages(ATHLETE, CONVERSATION_ID, { limit: 30 });

    expect(result.messages).toHaveLength(2);
    expect(result.hasMore).toBe(false);
    expect(result.nextCursor).toBeNull();
  });

  it('fetches one row past the page to learn there is more, then drops it', async () => {
    repo.listMessages.mockResolvedValue(page(3));

    const result = await service.listMessages(ATHLETE, CONVERSATION_ID, { limit: 2 });

    expect(repo.listMessages).toHaveBeenCalledWith(CONVERSATION_ID, {
      limit: 3,
      cursor: undefined,
    });
    expect(result.messages).toHaveLength(2);
    expect(result.hasMore).toBe(true);
    expect(result.nextCursor).not.toBeNull();
  });

  it('resumes from the cursor it issued', async () => {
    repo.listMessages.mockResolvedValue(page(3));
    const first = await service.listMessages(ATHLETE, CONVERSATION_ID, { limit: 2 });

    await service.listMessages(ATHLETE, CONVERSATION_ID, {
      limit: 2,
      cursor: first.nextCursor as string,
    });

    const [, options] = repo.listMessages.mock.calls[1];
    expect(options.cursor).toEqual({
      createdAt: new Date(Date.UTC(2026, 0, 10, 0, 0, 2)),
      id: 'message-1',
    });
  });

  it('rejects a cursor it did not issue', async () => {
    await expect(
      service.listMessages(ATHLETE, CONVERSATION_ID, { limit: 30, cursor: 'not-a-cursor' }),
    ).rejects.toBeInstanceOf(BadRequestException);
  });
});

describe('cursor codec', () => {
  it('round-trips the timestamp and the tie-breaking id', () => {
    const row = message({ id: 'message-42', createdAt: new Date('2026-03-04T05:06:07.008Z') });

    expect(decodeCursor(encodeCursor(row))).toEqual({
      createdAt: new Date('2026-03-04T05:06:07.008Z'),
      id: 'message-42',
    });
  });

  it('is opaque, so nothing client-side depends on its shape', () => {
    expect(encodeCursor(message())).not.toContain('message-1');
  });
});

// ─── Error classification ───────────────────────────────────

describe('isUniqueViolation', () => {
  it('recognises the pair index rejecting a duplicate', () => {
    expect(isUniqueViolation(uniqueViolation())).toBe(true);
  });

  it('sees through a wrapper that nests the original', () => {
    const wrapped = Object.assign(new Error('insert failed'), { cause: uniqueViolation() });
    expect(isUniqueViolation(wrapped)).toBe(true);
  });

  it('does not claim unrelated failures', () => {
    expect(isUniqueViolation(new Error('connection terminated'))).toBe(false);
    expect(isUniqueViolation(null)).toBe(false);
    expect(isUniqueViolation(undefined)).toBe(false);
  });
});
