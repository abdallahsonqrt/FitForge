// ─── Messaging Types ─────────────────────────────────────
//
// Athlete↔coach messaging. One thread per athlete/coach pair, carrying ordinary
// text alongside form-review requests, form-review videos, platform notices and
// AI-written summaries — all in the same ordered transcript.

/** Mirrors the `message_kind` Postgres enum. */
export type MessageKind =
  | 'text'
  | 'form_review_request'
  | 'form_review_video'
  | 'system'
  | 'ai_summary';

export interface Message {
  id: string;
  conversationId: string;
  senderUserId: string;
  kind: MessageKind;
  /** Message text, or the caption for a media message. */
  body: string | null;
  /** Resolved URL of an attached video or image; null for plain text. */
  attachmentUrl: string | null;
  /** Null until the other participant has read it. */
  readAt: string | null;
  createdAt: string;
}

/** The other side of a thread, as rendered in the inbox. */
export interface ConversationParticipant {
  userId: string;
  firstName: string;
  lastName: string;
  avatarUrl: string | null;
  role: 'athlete' | 'coach';
}

export interface Conversation {
  id: string;
  athleteUserId: string;
  coachUserId: string;
  /** Enrollment that opened the thread, when there was one. */
  enrollmentId: string | null;
  lastMessageAt: string | null;
  createdAt: string;
}

/** Inbox row: the thread plus what the list needs to render without a second fetch. */
export interface ConversationSummary extends Conversation {
  participant: ConversationParticipant;
  lastMessage: Message | null;
  unreadCount: number;
}

export interface ConversationDetail extends ConversationSummary {
  messages: Message[];
}

export interface SendMessageInput {
  conversationId: string;
  kind?: MessageKind;
  body?: string;
  attachmentUrl?: string;
}
