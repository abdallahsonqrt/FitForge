/**
 * The storage contract.
 *
 * Everything the application knows about object storage is in this file. No S3,
 * R2 or GCS type is allowed to cross it — the rest of the app talks to
 * `StorageService`, which talks to whichever `StorageProvider` was configured.
 * Swapping Cloudflare R2 for another backend means writing one new class that
 * satisfies `StorageProvider`; nothing else changes.
 */

/** DI token for the configured provider. Inject `StorageService`, not this. */
export const STORAGE_PROVIDER = 'STORAGE_PROVIDER';

export type StorageProviderName = 'r2' | 's3' | 'gcs' | 'external';

/**
 * `public` objects are readable at a stable URL and cacheable by the CDN.
 * `private` objects are only reachable through a signed, expiring URL.
 */
export type ObjectVisibility = 'public' | 'private';

export interface PutObjectInput {
  key: string;
  body: Buffer;
  contentType: string;
  /**
   * `Cache-Control` stored with the object. Media is immutable — a new upload
   * gets a new key — so a long max-age is safe and keeps playback off the origin.
   */
  cacheControl?: string;
  contentDisposition?: string;
  /** Small, non-sensitive provider metadata (e.g. the exercise id). */
  metadata?: Record<string, string>;
}

export interface StoredObject {
  key: string;
  provider: StorageProviderName;
  /** Stable URL when the bucket is served publicly, otherwise null. */
  publicUrl: string | null;
  size: number;
  contentType: string;
  /** Provider entity tag, when it returns one. */
  etag?: string;
}

/** What the provider knows about an object without downloading it. */
export interface StorageObjectInfo {
  key: string;
  size: number;
  contentType?: string;
  etag?: string;
  lastModified?: Date;
}

export interface SignedUrl {
  url: string;
  expiresAt: Date;
}

export interface SignedDownloadOptions {
  expiresInSeconds: number;
  /** Overrides the stored content type on the response — useful for byte-range playback. */
  responseContentType?: string;
  /** Set to force a download with a given filename instead of inline playback. */
  downloadFilename?: string;
}

export interface SignedUploadOptions {
  expiresInSeconds: number;
  contentType: string;
  /**
   * Signed into the URL when given, so the uploader cannot send a larger body
   * than was agreed. The client must send a matching `Content-Length`.
   */
  contentLength?: number;
}

/**
 * One storage backend. Implementations are constructed by `StorageModule` and
 * are the only place a vendor SDK appears.
 */
export interface StorageProvider {
  readonly name: StorageProviderName;
  /** False when credentials are missing; `StorageService` turns calls into a 503. */
  readonly isConfigured: boolean;
  /**
   * Whether the backend can serve a stable, unauthenticated URL. False for a
   * bucket with no public domain attached, in which case everything is signed.
   */
  readonly supportsPublicUrls: boolean;

  put(input: PutObjectInput): Promise<StoredObject>;
  delete(key: string): Promise<void>;
  deleteMany(keys: string[]): Promise<void>;
  /** Object metadata, or null when the key does not exist. */
  head(key: string): Promise<StorageObjectInfo | null>;
  /** Stable public URL for a key, or null when the bucket is private. */
  getPublicUrl(key: string): string | null;
  createSignedDownloadUrl(key: string, options: SignedDownloadOptions): Promise<SignedUrl>;
  createSignedUploadUrl(key: string, options: SignedUploadOptions): Promise<SignedUrl>;
}
