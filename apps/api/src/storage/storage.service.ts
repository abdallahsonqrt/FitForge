import {
  BadRequestException,
  Inject,
  Injectable,
  InternalServerErrorException,
  Logger,
  ServiceUnavailableException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { randomUUID } from 'node:crypto';
import {
  ObjectVisibility,
  PutObjectInput,
  SignedDownloadOptions,
  SignedUploadOptions,
  SignedUrl,
  STORAGE_PROVIDER,
  StorageObjectInfo,
  StorageProvider,
  StorageProviderName,
  StoredObject,
} from './storage.types';

/**
 * Media never changes in place — a replacement gets a new key — so objects can be
 * cached hard and forever by the CDN and the device.
 */
const IMMUTABLE_CACHE_CONTROL = 'public, max-age=31536000, immutable';

/** Key segments are ours to generate; this is the shape we allow. */
const SAFE_SEGMENT = /^[a-z0-9][a-z0-9._-]*$/i;

/**
 * The application's single door to object storage.
 *
 * Nothing outside `src/storage` may import a provider or an SDK. This service
 * owns the policy that is the same whichever backend is behind it — key layout,
 * cache headers, URL resolution, signed-URL lifetimes and the "storage is not
 * configured" failure mode — and delegates the bytes to the configured provider.
 */
@Injectable()
export class StorageService {
  private readonly logger = new Logger(StorageService.name);

  constructor(
    @Inject(STORAGE_PROVIDER) private readonly provider: StorageProvider,
    private readonly config: ConfigService,
  ) {}

  get providerName(): StorageProviderName {
    return this.provider.name;
  }

  /** False when credentials are missing. Callers that only read stored URLs can ignore it. */
  get isConfigured(): boolean {
    return this.provider.isConfigured;
  }

  /** Visibility to apply to new uploads, from `MEDIA_DEFAULT_VISIBILITY`. */
  get defaultVisibility(): ObjectVisibility {
    // A bucket with no public base URL cannot serve a stable URL, so private is
    // the only honest answer regardless of what the setting says.
    const configured = this.config.get<ObjectVisibility>('MEDIA_DEFAULT_VISIBILITY') ?? 'public';
    return configured === 'public' && this.provider.supportsPublicUrls ? 'public' : 'private';
  }

  /**
   * Settle the visibility of a new object: what the caller asked for, or the
   * configured default.
   *
   * Asking for `public` on a bucket with no public domain is rejected rather than
   * quietly downgraded — the object would be stored with a promise of a stable URL
   * that nothing could ever serve.
   */
  resolveVisibility(requested?: ObjectVisibility): ObjectVisibility {
    if (!requested) return this.defaultVisibility;

    if (requested === 'public' && !this.provider.supportsPublicUrls) {
      throw new BadRequestException(
        'This bucket has no public URL configured, so media cannot be stored as public. ' +
          'Set R2_PUBLIC_BASE_URL to a custom domain (or the bucket\'s r2.dev address), or upload it as private.',
      );
    }

    return requested;
  }

  get signedUrlTtlSeconds(): number {
    return this.config.get<number>('MEDIA_SIGNED_URL_TTL_SECONDS') ?? 3600;
  }

  get uploadUrlTtlSeconds(): number {
    return this.config.get<number>('MEDIA_UPLOAD_URL_TTL_SECONDS') ?? 900;
  }

  /**
   * Build an object key: `<prefix>/<segments…>/<uuid>.<ext>`.
   *
   * The final segment is random rather than derived from the uploaded filename.
   * That keeps user-supplied text out of the key entirely, makes every upload
   * collision-free, and lets a replacement live at a new key so caches never
   * serve a stale video.
   */
  createObjectKey(segments: string[], extension: string): string {
    const prefix = this.config.get<string>('MEDIA_KEY_PREFIX') ?? 'exercises';
    const parts = [prefix, ...segments].map((segment) => this.assertSafeSegment(segment));
    const ext = this.assertSafeSegment(extension.replace(/^\./, '')).toLowerCase();

    return `${parts.join('/')}/${randomUUID()}.${ext}`;
  }

  async upload(input: PutObjectInput): Promise<StoredObject> {
    this.ensureConfigured();

    try {
      return await this.provider.put({
        cacheControl: IMMUTABLE_CACHE_CONTROL,
        ...input,
      });
    } catch (error) {
      this.logger.error(`Upload to ${this.provider.name} failed for key ${input.key}`, error as Error);
      throw new InternalServerErrorException('The file could not be stored. Please try again.');
    }
  }

  /**
   * Remove an object. Missing keys are not an error — deletion has to be safe to
   * retry after a half-finished cleanup.
   */
  async delete(key: string): Promise<void> {
    this.ensureConfigured();
    await this.provider.delete(key);
  }

  async deleteMany(keys: string[]): Promise<void> {
    if (keys.length === 0) return;
    this.ensureConfigured();
    await this.provider.deleteMany(keys);
  }

  /**
   * Best-effort cleanup for keys whose database rows are already gone. Never
   * throws: a failed byte delete must not turn a successful request into a 500,
   * it just leaves an orphan for the bucket's lifecycle rules.
   */
  async deleteQuietly(keys: string[]): Promise<void> {
    const present = keys.filter(Boolean);
    if (present.length === 0 || !this.isConfigured) return;

    try {
      await this.provider.deleteMany(present);
    } catch (error) {
      this.logger.error(`Failed to delete stored objects: ${present.join(', ')}`, error as Error);
    }
  }

  async head(key: string): Promise<StorageObjectInfo | null> {
    this.ensureConfigured();
    return this.provider.head(key);
  }

  async exists(key: string): Promise<boolean> {
    return (await this.head(key)) !== null;
  }

  /** Stable URL for a public object, or null when the bucket is private. */
  getPublicUrl(key: string): string | null {
    return this.provider.getPublicUrl(key);
  }

  /**
   * Short-lived URL for a private object. Defaults to `MEDIA_SIGNED_URL_TTL_SECONDS`
   * so a caller cannot accidentally mint a long-lived link.
   */
  async createSignedDownloadUrl(
    key: string,
    options: Partial<SignedDownloadOptions> = {},
  ): Promise<SignedUrl> {
    this.ensureConfigured();

    return this.provider.createSignedDownloadUrl(key, {
      expiresInSeconds: options.expiresInSeconds ?? this.signedUrlTtlSeconds,
      responseContentType: options.responseContentType,
      downloadFilename: options.downloadFilename,
    });
  }

  /**
   * URL an admin client can PUT straight to, bypassing the API for the bytes.
   * This is what keeps a 100 MB upload off the API's memory and event loop.
   */
  async createSignedUploadUrl(
    key: string,
    options: SignedUploadOptions & { expiresInSeconds?: number },
  ): Promise<SignedUrl> {
    this.ensureConfigured();

    return this.provider.createSignedUploadUrl(key, {
      expiresInSeconds: options.expiresInSeconds ?? this.uploadUrlTtlSeconds,
      contentType: options.contentType,
      contentLength: options.contentLength,
    });
  }

  // ─── Internals ────────────────────────────────────────────

  private ensureConfigured(): void {
    if (this.provider.isConfigured) return;

    throw new ServiceUnavailableException(
      'Media storage is not configured on this server. Set the storage provider credentials to enable uploads.',
    );
  }

  private assertSafeSegment(segment: string): string {
    const trimmed = segment.trim();
    if (!SAFE_SEGMENT.test(trimmed) || trimmed.includes('..')) {
      // Keys are built from our own ids and constants, so this is a programming
      // error rather than a user one — but it is the check that keeps it that way.
      throw new InternalServerErrorException(`Unsafe storage key segment: "${segment}"`);
    }
    return trimmed;
  }
}
