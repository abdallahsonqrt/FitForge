import { BadRequestException, Injectable, PayloadTooLargeException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import {
  ACCEPTED_IMAGE_MIME_TYPES,
  ACCEPTED_VIDEO_MIME_TYPES,
  MediaFormat,
  UploadedFile,
  formatBytes,
  readImageDimensions,
  sha256Hex,
  sniffImageFormat,
  sniffVideoFormat,
} from './media-file.util';

/** What a validated upload looks like to the rest of the module. */
export interface ValidatedUpload {
  buffer: Buffer;
  /** Content type taken from the file's own bytes, not from the request. */
  mimeType: string;
  extension: string;
  size: number;
  checksumSha256: string;
  /** Present for images, where the header states the size. */
  dimensions?: { width: number; height: number };
}

/**
 * The gate every uploaded byte passes through.
 *
 * Three independent checks, in order of cost: the request must actually carry a
 * file, the file must be within the configured size limit, and the bytes must
 * *be* what they claim — a `.mp4` whose header says otherwise is rejected here
 * rather than stored and served to every user of the app.
 */
@Injectable()
export class MediaValidationService {
  constructor(private readonly config: ConfigService) {}

  get maxVideoBytes(): number {
    return this.config.get<number>('MEDIA_MAX_VIDEO_BYTES') ?? 100 * 1024 * 1024;
  }

  get maxImageBytes(): number {
    return this.config.get<number>('MEDIA_MAX_IMAGE_BYTES') ?? 5 * 1024 * 1024;
  }

  validateVideo(file: UploadedFile | undefined): ValidatedUpload {
    const present = this.requireFile(file, 'video');
    this.requireSize(present, this.maxVideoBytes, 'Video');

    const format = sniffVideoFormat(present.buffer);
    if (!format) {
      throw new BadRequestException(
        `That file is not a video we can serve. Upload MP4 (H.264 + AAC), MOV or WebM — accepted types: ${ACCEPTED_VIDEO_MIME_TYPES.join(', ')}.`,
      );
    }

    return this.describe(present, format);
  }

  validateImage(file: UploadedFile | undefined, label = 'Image'): ValidatedUpload {
    const present = this.requireFile(file, 'image');
    this.requireSize(present, this.maxImageBytes, label);

    const format = sniffImageFormat(present.buffer);
    if (!format) {
      throw new BadRequestException(
        `That file is not an image we can serve. Upload JPEG, PNG, WebP or GIF — accepted types: ${ACCEPTED_IMAGE_MIME_TYPES.join(', ')}.`,
      );
    }

    const dimensions = readImageDimensions(present.buffer) ?? undefined;
    return { ...this.describe(present, format), dimensions };
  }

  /**
   * Content type a direct-to-bucket upload is allowed to request.
   *
   * The bytes cannot be inspected before they exist, so this is the one place the
   * client's declared type is trusted — which is why `POST /complete` re-checks
   * what actually landed before the row is marked ready.
   */
  assertUploadableVideoType(mimeType: string): void {
    if (!ACCEPTED_VIDEO_MIME_TYPES.includes(mimeType)) {
      throw new BadRequestException(
        `Content type "${mimeType}" is not an accepted video type (${ACCEPTED_VIDEO_MIME_TYPES.join(', ')}).`,
      );
    }
  }

  assertUploadableSize(bytes: number, max = this.maxVideoBytes): void {
    if (bytes <= 0) {
      throw new BadRequestException('Declare the file size so the upload URL can be limited to it.');
    }
    if (bytes > max) {
      throw new PayloadTooLargeException(
        `That file is ${formatBytes(bytes)}; the limit is ${formatBytes(max)}.`,
      );
    }
  }

  // ─── Internals ────────────────────────────────────────────

  private requireFile(file: UploadedFile | undefined, kind: string): UploadedFile {
    if (!file?.buffer?.length) {
      throw new BadRequestException(`Attach a ${kind} file in the "file" field of the form data.`);
    }
    return file;
  }

  private requireSize(file: UploadedFile, max: number, label: string): void {
    if (file.buffer.byteLength > max) {
      throw new PayloadTooLargeException(
        `${label} is ${formatBytes(file.buffer.byteLength)}; the limit is ${formatBytes(max)}. ` +
          'Instructional clips should be 10–30 seconds at 720p, which comfortably fits.',
      );
    }
  }

  private describe(file: UploadedFile, format: MediaFormat): ValidatedUpload {
    return {
      buffer: file.buffer,
      mimeType: format.mimeType,
      extension: format.extension,
      size: file.buffer.byteLength,
      checksumSha256: sha256Hex(file.buffer),
    };
  }
}
