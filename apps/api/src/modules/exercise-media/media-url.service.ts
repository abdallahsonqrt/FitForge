import { Injectable, Logger } from '@nestjs/common';
import { StorageService } from '../../storage';

/** The stored fields a media row must expose to be resolvable to a URL. */
export interface ResolvableMedia {
  storageKey: string;
  visibility: 'public' | 'private';
  publicUrl: string | null;
  provider: 'r2' | 's3' | 'gcs' | 'external';
  mimeType?: string | null;
}

export interface ResolvedUrl {
  url: string | null;
  /** Null for stable public URLs; a timestamp for signed ones. */
  expiresAt: Date | null;
}

/**
 * Turns a stored media row into a URL a device can fetch.
 *
 * The rule in one place, because it is the security boundary for media:
 *
 * - `public` objects resolve to their stable CDN URL. Fastest path, cacheable at
 *   the edge and on the device, and no signing cost per view.
 * - `private` objects resolve to a signed URL that expires. The bucket stays
 *   closed; the credentials never leave the server.
 * - `external` rows are legacy imports whose URL we do not own — passed through
 *   untouched.
 */
@Injectable()
export class MediaUrlService {
  private readonly logger = new Logger(MediaUrlService.name);

  constructor(private readonly storage: StorageService) {}

  async resolve(media: ResolvableMedia, expiresInSeconds?: number): Promise<ResolvedUrl> {
    if (media.provider === 'external') {
      return { url: media.publicUrl, expiresAt: null };
    }

    if (media.visibility === 'public') {
      // `publicUrl` is a cache of the key under the public base URL. Re-deriving
      // when it is missing lets a bucket that gained a domain after upload serve
      // its existing objects without a backfill.
      return { url: media.publicUrl ?? this.storage.getPublicUrl(media.storageKey), expiresAt: null };
    }

    if (!this.storage.isConfigured) {
      // Reads must not 503 just because signing is unavailable — the caller
      // renders a "video unavailable" state instead.
      this.logger.warn(
        `Cannot sign a URL for ${media.storageKey}: storage is not configured on this server.`,
      );
      return { url: null, expiresAt: null };
    }

    const signed = await this.storage.createSignedDownloadUrl(media.storageKey, {
      expiresInSeconds,
      responseContentType: media.mimeType ?? undefined,
    });

    return { url: signed.url, expiresAt: signed.expiresAt };
  }

  /** Convenience for thumbnails and other places only the URL is wanted. */
  async resolveUrl(
    media: ResolvableMedia | null | undefined,
    expiresInSeconds?: number,
  ): Promise<string | null> {
    if (!media) return null;
    return (await this.resolve(media, expiresInSeconds)).url;
  }
}
