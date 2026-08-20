import type { Conversation, Message } from '../../database/schema';

/**
 * Wire shapes for athlete↔coach messaging.
 *
 * These mirror `@fitforge/shared`'s `types/messaging.ts` field for field — the
 * API does not depend on the shared package, so the contract is restated here
 * and timestamps are serialised to ISO strings rather than handed out as `Date`
 * objects that only happen to stringify correctly.
 */

/** Kinds an end user may author. `system` and `ai_summary` are deliberately absent. */
export const USER_MESSAGE_KINDS = ['text', 'form_review_request', 'form_review_video'] as const;
export type UserMessageKind = (typeof USER_MESSAGE_KINDS)[number];

/**
 * Kinds only the platform may write — a notice the server generates, or the AI
 * assistant's summary of an athlete's week. Reachable through
 * `MessagingService.postPlatformMessage`, never through an HTTP route.
 */
export const PLATFORM_MESSAGE_KINDS = ['system', 'ai_summary'] as const;
export type PlatformMessageKind = (typeof PLATFORM_MESSAGE_KINDS)[number];

export type MessageKind = UserMessageKind | PlatformMessageKind;

/** Kinds whose payload is a file rather than prose. */
export const ATTACHMENT_MESSAGE_KINDS: readonly MessageKind[] = [
  'form_review_request',
  'form_review_video',
];

export interface MessageView {
  id: string;
  conversationId: string;
  senderUserId: string;
  kind: MessageKind;
  body: string | null;
  attachmentUrl: string | null;
  readAt: string | null;
  createdAt: string;
}

/** The other side of a thread, as the inbox renders it. */
export interface ConversationParticipant {
  userId: string;
  firstName: string;
  lastName: string;
  avatarUrl: string | null;
  role: 'athlete' | 'coach';
}

export interface ConversationView {
  id: string;
  athleteUserId: string;
  coachUserId: string;
  enrollmentId: string | null;
  lastMessageAt: string | null;
  createdAt: string;
}

/** Inbox row: the thread plus everything the list needs without a second fetch. */
export interface ConversationSummary extends ConversationView {
  /** Always the participant the caller is *not*. */
  participant: ConversationParticipant;
  lastMessage: MessageView | null;
  unreadCount: number;
}

/** One page of a transcript, newest first. */
export interface MessagePage {
  messages: MessageView[];
  /** Opaque token for the next (older) page, or null at the end of the thread. */
  nextCursor: string | null;
  hasMore: boolean;
}

/** The joined row `MessagingRepository` returns for an inbox listing. */
export interface ConversationWithParticipants {
  conversation: Conversation;
  athlete: ParticipantRow;
  coach: ParticipantRow;
}

export interface ParticipantRow {
  userId: string;
  firstName: string | null;
  lastName: string | null;
  avatarUrl: string | null;
}

/** Where a `GET …/messages` page resumes from. */
export interface MessageCursor {
  createdAt: Date;
  id: string;
}

// ─── Mappers ────────────────────────────────────────────────

const toIso = (value: Date | null): string | null => (value ? value.toISOString() : null);

export function toMessageView(row: Message): MessageView {
  return {
    id: row.id,
    conversationId: row.conversationId,
    senderUserId: row.senderUserId,
    kind: row.kind,
    body: row.body,
    attachmentUrl: row.attachmentUrl,
    readAt: toIso(row.readAt),
    createdAt: row.createdAt.toISOString(),
  };
}

export function toConversationView(row: Conversation): ConversationView {
  return {
    id: row.id,
    athleteUserId: row.athleteUserId,
    coachUserId: row.coachUserId,
    enrollmentId: row.enrollmentId,
    lastMessageAt: toIso(row.lastMessageAt),
    createdAt: row.createdAt.toISOString(),
  };
}

export function toParticipant(
  row: ParticipantRow,
  role: ConversationParticipant['role'],
): ConversationParticipant {
  return {
    userId: row.userId,
    firstName: row.firstName ?? '',
    lastName: row.lastName ?? '',
    avatarUrl: row.avatarUrl,
    role,
  };
}
