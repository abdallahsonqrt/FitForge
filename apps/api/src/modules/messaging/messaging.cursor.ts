import { BadRequestException } from '@nestjs/common';
import type { Message } from '../../database/schema';
import type { MessageCursor } from './messaging.types';

/**
 * Transcript paging keys.
 *
 * `created_at` alone is not a stable cursor: two messages posted in the same
 * millisecond would make a page boundary drop or repeat a row. The key is
 * therefore `(created_at, id)`, and it is handed to the client base64-encoded so
 * nothing depends on its shape — the server can change the key later without
 * breaking a client that stored one.
 */

const SEPARATOR = '|';

export function encodeCursor(message: Pick<Message, 'id' | 'createdAt'>): string {
  return Buffer.from(`${message.createdAt.toISOString()}${SEPARATOR}${message.id}`).toString(
    'base64url',
  );
}

export function decodeCursor(cursor: string): MessageCursor {
  const decoded = Buffer.from(cursor, 'base64url').toString('utf8');
  const separatorAt = decoded.indexOf(SEPARATOR);

  if (separatorAt === -1) throw invalid();

  const createdAt = new Date(decoded.slice(0, separatorAt));
  const id = decoded.slice(separatorAt + 1);

  if (Number.isNaN(createdAt.getTime()) || !id) throw invalid();

  return { createdAt, id };
}

const invalid = () =>
  new BadRequestException('That cursor is not one this endpoint issued. Omit it to start again.');
