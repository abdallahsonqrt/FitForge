import { createHash } from 'node:crypto';

/**
 * File-shape helpers shared by the upload paths.
 *
 * The client's declared content type is a hint, never a fact — it is trivially
 * forged, and a mislabelled file is the classic way to get an unexpected payload
 * into a bucket that something else will later serve. Everything here works from
 * the bytes.
 */

/** A file as multer hands it over, narrowed to what we actually use. */
export interface UploadedFile {
  originalname: string;
  mimetype: string;
  size: number;
  buffer: Buffer;
}

export interface MediaFormat {
  /** Canonical content type to store and serve with. */
  mimeType: string;
  extension: string;
}

/**
 * Video containers we accept.
 *
 * MP4 (H.264 + AAC) is the only format that plays everywhere without a polyfill
 * and is what the app asks admins to upload; QuickTime and WebM are accepted
 * because phones produce them, and they are transcoded downstream rather than
 * rejected at the door.
 */
const VIDEO_FORMATS: MediaFormat[] = [
  { mimeType: 'video/mp4', extension: 'mp4' },
  { mimeType: 'video/quicktime', extension: 'mov' },
  { mimeType: 'video/webm', extension: 'webm' },
];

const IMAGE_FORMATS: MediaFormat[] = [
  { mimeType: 'image/jpeg', extension: 'jpg' },
  { mimeType: 'image/png', extension: 'png' },
  { mimeType: 'image/webp', extension: 'webp' },
  { mimeType: 'image/gif', extension: 'gif' },
];

export const ACCEPTED_VIDEO_MIME_TYPES = VIDEO_FORMATS.map((format) => format.mimeType);
export const ACCEPTED_IMAGE_MIME_TYPES = IMAGE_FORMATS.map((format) => format.mimeType);

/**
 * Extension for a declared video type. Used only on the direct-upload path, where
 * the key has to be chosen before any bytes exist to sniff.
 */
export function extensionForVideoMimeType(mimeType: string): string {
  return VIDEO_FORMATS.find((format) => format.mimeType === mimeType)?.extension ?? 'mp4';
}

const asciiAt = (buffer: Buffer, offset: number, length: number): string =>
  buffer.subarray(offset, offset + length).toString('ascii');

const startsWith = (buffer: Buffer, signature: number[]): boolean =>
  buffer.length >= signature.length && signature.every((byte, index) => buffer[index] === byte);

/**
 * Identify a video container from its header.
 *
 * ISO base media files (MP4, MOV) carry `ftyp` at offset 4 followed by a brand:
 * `qt  ` means QuickTime, everything else in practice means MP4. WebM is a
 * Matroska stream, which starts with the EBML magic number.
 */
export function sniffVideoFormat(buffer: Buffer): MediaFormat | null {
  if (buffer.length < 16) return null;

  if (asciiAt(buffer, 4, 4) === 'ftyp') {
    const brand = asciiAt(buffer, 8, 4);
    return brand === 'qt  '
      ? { mimeType: 'video/quicktime', extension: 'mov' }
      : { mimeType: 'video/mp4', extension: 'mp4' };
  }

  // EBML header — Matroska/WebM.
  if (startsWith(buffer, [0x1a, 0x45, 0xdf, 0xa3])) {
    return { mimeType: 'video/webm', extension: 'webm' };
  }

  return null;
}

export function sniffImageFormat(buffer: Buffer): MediaFormat | null {
  if (buffer.length < 12) return null;

  if (startsWith(buffer, [0xff, 0xd8, 0xff])) {
    return { mimeType: 'image/jpeg', extension: 'jpg' };
  }
  if (startsWith(buffer, [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a])) {
    return { mimeType: 'image/png', extension: 'png' };
  }
  if (asciiAt(buffer, 0, 4) === 'RIFF' && asciiAt(buffer, 8, 4) === 'WEBP') {
    return { mimeType: 'image/webp', extension: 'webp' };
  }
  if (asciiAt(buffer, 0, 6) === 'GIF89a' || asciiAt(buffer, 0, 6) === 'GIF87a') {
    return { mimeType: 'image/gif', extension: 'gif' };
  }

  return null;
}

/** Hex SHA-256 of the bytes — stored with the row for integrity and duplicate detection. */
export function sha256Hex(buffer: Buffer): string {
  return createHash('sha256').update(buffer).digest('hex');
}

/**
 * Read PNG/JPEG/GIF/WebP dimensions from the header.
 *
 * A thumbnail's size matters to the client (it reserves layout space with it), and
 * these four formats state it in bytes we have already read — no image library,
 * no decode of a file that just arrived from outside.
 */
export function readImageDimensions(
  buffer: Buffer,
): { width: number; height: number } | null {
  const format = sniffImageFormat(buffer);
  if (!format) return null;

  switch (format.extension) {
    case 'png':
      // IHDR is the first chunk: width and height are big-endian at 16 and 20.
      return buffer.length >= 24
        ? { width: buffer.readUInt32BE(16), height: buffer.readUInt32BE(20) }
        : null;

    case 'gif':
      // Logical screen descriptor, little-endian, immediately after the signature.
      return buffer.length >= 10
        ? { width: buffer.readUInt16LE(6), height: buffer.readUInt16LE(8) }
        : null;

    case 'jpg':
      return readJpegDimensions(buffer);

    case 'webp':
      return readWebpDimensions(buffer);

    default:
      return null;
  }
}

/** Walk the JPEG marker segments to the start-of-frame, which carries the size. */
function readJpegDimensions(buffer: Buffer): { width: number; height: number } | null {
  let offset = 2; // Skip SOI.

  while (offset + 9 < buffer.length) {
    if (buffer[offset] !== 0xff) {
      offset += 1;
      continue;
    }

    const marker = buffer[offset + 1];
    // SOF0..SOF15, excluding the DHT/JPG/DAC markers that share the range.
    const isStartOfFrame =
      marker >= 0xc0 && marker <= 0xcf && marker !== 0xc4 && marker !== 0xc8 && marker !== 0xcc;

    if (isStartOfFrame) {
      return { height: buffer.readUInt16BE(offset + 5), width: buffer.readUInt16BE(offset + 7) };
    }

    const segmentLength = buffer.readUInt16BE(offset + 2);
    if (segmentLength < 2) return null;
    offset += 2 + segmentLength;
  }

  return null;
}

/** WebP has three sub-formats; each states its size in a different place. */
function readWebpDimensions(buffer: Buffer): { width: number; height: number } | null {
  const chunk = asciiAt(buffer, 12, 4);

  if (chunk === 'VP8X' && buffer.length >= 30) {
    // 24-bit little-endian, stored as (size - 1).
    const width = 1 + (buffer[24] | (buffer[25] << 8) | (buffer[26] << 16));
    const height = 1 + (buffer[27] | (buffer[28] << 8) | (buffer[29] << 16));
    return { width, height };
  }

  if (chunk === 'VP8L' && buffer.length >= 25) {
    const bits = buffer.readUInt32LE(21);
    return { width: 1 + (bits & 0x3fff), height: 1 + ((bits >> 14) & 0x3fff) };
  }

  if (chunk === 'VP8 ' && buffer.length >= 30) {
    return {
      width: buffer.readUInt16LE(26) & 0x3fff,
      height: buffer.readUInt16LE(28) & 0x3fff,
    };
  }

  return null;
}

/** Human-readable byte size for error messages ("104.9 MB"). */
export function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  const units = ['KB', 'MB', 'GB'];
  let value = bytes / 1024;
  let unitIndex = 0;

  while (value >= 1024 && unitIndex < units.length - 1) {
    value /= 1024;
    unitIndex += 1;
  }

  return `${value.toFixed(1)} ${units[unitIndex]}`;
}
