import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import {
  DeleteObjectCommand,
  DeleteObjectsCommand,
  GetObjectCommand,
  HeadObjectCommand,
  PutObjectCommand,
  S3Client,
} from '@aws-sdk/client-s3';
import { getSignedUrl } from '@aws-sdk/s3-request-presigner';
import {
  PutObjectInput,
  SignedDownloadOptions,
  SignedUploadOptions,
  SignedUrl,
  StorageObjectInfo,
  StorageProvider,
  StorageProviderName,
  StoredObject,
} from '../storage.types';

/** DeleteObjects accepts at most 1000 keys per request. */
const DELETE_BATCH_SIZE = 1000;

/**
 * Cloudflare R2, over its S3-compatible API.
 *
 * The only file in the project that imports an S3 SDK. Notable R2 differences
 * from AWS S3, all handled here:
 *
 * - Region is always `auto`; the account endpoint decides placement.
 * - Object ACLs are not supported. Public access is a property of the *bucket*
 *   (a custom domain or the `r2.dev` address), so `visibility` is recorded in our
 *   database and expressed by whether we hand out a public or a signed URL —
 *   never by a per-object ACL.
 * - Egress is free, which is what makes serving video straight from the bucket to
 *   the device the right call rather than proxying bytes through the API.
 */
@Injectable()
export class CloudflareR2StorageProvider implements StorageProvider {
  readonly name: StorageProviderName = 'r2';

  private readonly logger = new Logger(CloudflareR2StorageProvider.name);
  private readonly client: S3Client | null;
  private readonly bucket: string;
  private readonly publicBaseUrl: string | null;

  constructor(private readonly config: ConfigService) {
    const accountId = this.config.get<string>('R2_ACCOUNT_ID');
    const accessKeyId = this.config.get<string>('R2_ACCESS_KEY_ID');
    const secretAccessKey = this.config.get<string>('R2_SECRET_ACCESS_KEY');
    const bucket = this.config.get<string>('R2_BUCKET');
    const endpoint =
      this.config.get<string>('R2_ENDPOINT') ??
      (accountId ? `https://${accountId}.r2.cloudflarestorage.com` : undefined);

    this.bucket = bucket ?? '';
    this.publicBaseUrl = (this.config.get<string>('R2_PUBLIC_BASE_URL') ?? '').replace(/\/+$/, '') || null;

    if (!endpoint || !accessKeyId || !secretAccessKey || !bucket) {
      this.client = null;
      this.logger.warn(
        'Cloudflare R2 is not configured (R2_ACCOUNT_ID, R2_ACCESS_KEY_ID, R2_SECRET_ACCESS_KEY, R2_BUCKET). Media uploads and signed URLs are disabled.',
      );
      return;
    }

    this.client = new S3Client({
      region: 'auto',
      endpoint,
      credentials: { accessKeyId, secretAccessKey },
      // R2 serves the bucket as a path segment under the account endpoint. Virtual
      // host addressing would put the bucket name in the hostname, which breaks for
      // any bucket name that is not a valid DNS label.
      forcePathStyle: true,
      // The SDK adds CRC32 integrity headers to every request by default. On a
      // presigned PUT those headers are signed but not sent by the browser, which
      // fails the signature — so checksums are requested only where the API
      // requires them. Upload integrity is covered by our own SHA-256, recorded
      // alongside the row.
      requestChecksumCalculation: 'WHEN_REQUIRED',
      responseChecksumValidation: 'WHEN_REQUIRED',
    });
  }

  get isConfigured(): boolean {
    return this.client !== null;
  }

  /** True once a custom domain or `r2.dev` address is configured for the bucket. */
  get supportsPublicUrls(): boolean {
    return this.publicBaseUrl !== null;
  }

  async put(input: PutObjectInput): Promise<StoredObject> {
    const client = this.requireClient();

    const result = await client.send(
      new PutObjectCommand({
        Bucket: this.bucket,
        Key: input.key,
        Body: input.body,
        ContentType: input.contentType,
        ContentLength: input.body.byteLength,
        CacheControl: input.cacheControl,
        ContentDisposition: input.contentDisposition,
        Metadata: input.metadata,
      }),
    );

    return {
      key: input.key,
      provider: this.name,
      publicUrl: this.getPublicUrl(input.key),
      size: input.body.byteLength,
      contentType: input.contentType,
      etag: result.ETag?.replace(/"/g, ''),
    };
  }

  async delete(key: string): Promise<void> {
    const client = this.requireClient();
    await client.send(new DeleteObjectCommand({ Bucket: this.bucket, Key: key }));
  }

  async deleteMany(keys: string[]): Promise<void> {
    if (keys.length === 0) return;
    const client = this.requireClient();

    for (let index = 0; index < keys.length; index += DELETE_BATCH_SIZE) {
      const batch = keys.slice(index, index + DELETE_BATCH_SIZE);
      await client.send(
        new DeleteObjectsCommand({
          Bucket: this.bucket,
          Delete: { Objects: batch.map((key) => ({ Key: key })), Quiet: true },
        }),
      );
    }
  }

  async head(key: string): Promise<StorageObjectInfo | null> {
    const client = this.requireClient();

    try {
      const result = await client.send(new HeadObjectCommand({ Bucket: this.bucket, Key: key }));
      return {
        key,
        size: result.ContentLength ?? 0,
        contentType: result.ContentType,
        etag: result.ETag?.replace(/"/g, ''),
        lastModified: result.LastModified,
      };
    } catch (error) {
      if (this.isNotFound(error)) return null;
      throw error;
    }
  }

  getPublicUrl(key: string): string | null {
    if (!this.publicBaseUrl) return null;
    // Each segment is encoded separately so the key's slashes stay path separators.
    const encoded = key.split('/').map(encodeURIComponent).join('/');
    return `${this.publicBaseUrl}/${encoded}`;
  }

  async createSignedDownloadUrl(key: string, options: SignedDownloadOptions): Promise<SignedUrl> {
    const client = this.requireClient();

    const command = new GetObjectCommand({
      Bucket: this.bucket,
      Key: key,
      ResponseContentType: options.responseContentType,
      ResponseContentDisposition: options.downloadFilename
        ? `attachment; filename="${options.downloadFilename.replace(/"/g, '')}"`
        : undefined,
    });

    const url = await getSignedUrl(client, command, { expiresIn: options.expiresInSeconds });
    return { url, expiresAt: new Date(Date.now() + options.expiresInSeconds * 1000) };
  }

  async createSignedUploadUrl(key: string, options: SignedUploadOptions): Promise<SignedUrl> {
    const client = this.requireClient();

    const command = new PutObjectCommand({
      Bucket: this.bucket,
      Key: key,
      ContentType: options.contentType,
      // Signed, so the uploader cannot substitute a larger body than we agreed to.
      ContentLength: options.contentLength,
    });

    const url = await getSignedUrl(client, command, {
      expiresIn: options.expiresInSeconds,
      // Both are enforced at upload time, so they must be part of the signature
      // rather than hoisted into the query string.
      unhoistableHeaders: new Set(['content-length']),
    });
    return { url, expiresAt: new Date(Date.now() + options.expiresInSeconds * 1000) };
  }

  // ─── Internals ────────────────────────────────────────────

  private requireClient(): S3Client {
    if (!this.client) {
      // StorageService checks `isConfigured` first and raises a 503; reaching here
      // means a provider call bypassed it.
      throw new Error('Cloudflare R2 client is not configured.');
    }
    return this.client;
  }

  private isNotFound(error: unknown): boolean {
    const candidate = error as { name?: string; $metadata?: { httpStatusCode?: number } };
    return (
      candidate?.name === 'NotFound' ||
      candidate?.name === 'NoSuchKey' ||
      candidate?.$metadata?.httpStatusCode === 404
    );
  }
}
