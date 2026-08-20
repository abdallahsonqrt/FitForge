import {
  BadRequestException,
  ConflictException,
  Injectable,
  Logger,
  NotFoundException,
  ServiceUnavailableException,
} from '@nestjs/common';
import type { ExerciseImage, ExerciseVideo } from '../../database/schema';
import { StorageService } from '../../storage';
import { ExerciseMediaRepository } from './exercise-media.repository';
import { ExerciseMediaMapper, MapperOptions } from './exercise-media.mapper';
import { MediaValidationService } from './media-validation.service';
import { VideoMetadata, VideoProcessingService } from './video-processing.service';
import { ExerciseImagesService } from './exercise-images.service';
import { MediaUrlService } from './media-url.service';
import { UploadedFile, extensionForVideoMimeType } from './media-file.util';
import {
  DirectUploadTicket,
  ExerciseVideoRecord,
  ExerciseVideoResponse,
  ExerciseVideoUploadResponse,
  PaginatedVideos,
  PlaybackUrlResponse,
} from './exercise-media.types';
import {
  CompleteUploadDto,
  CreateUploadUrlDto,
  ListExerciseVideosDto,
  PlaybackUrlDto,
  UpdateExerciseVideoDto,
  UploadExerciseVideoDto,
} from './dto/exercise-video.dto';
import { UploadVideoThumbnailDto } from './dto/exercise-image.dto';

/**
 * Exercise videos: upload, lifecycle and playback.
 *
 * Two upload paths, for two different problems:
 *
 * 1. `upload()` — the bytes come through the API. Everything can be checked
 *    (magic bytes, real duration and dimensions) and a poster frame cut, at the
 *    cost of buffering the file in memory. Right for the 10–30 second, few-MB
 *    instructional clips this library is made of.
 *
 * 2. `createDirectUploadUrl()` + `completeDirectUpload()` — the client PUTs
 *    straight to the bucket with a signed URL and the API only records metadata.
 *    Nothing large ever touches the API process, which is what lets the library
 *    grow to tens of thousands of videos on the same server budget.
 *
 * Playback in both cases is served by the bucket, never proxied: R2 answers byte
 * ranges, so the player starts on the first chunk and seeks without downloading
 * the file.
 */
@Injectable()
export class ExerciseVideosService {
  private readonly logger = new Logger(ExerciseVideosService.name);

  constructor(
    private readonly repository: ExerciseMediaRepository,
    private readonly storage: StorageService,
    private readonly validation: MediaValidationService,
    private readonly processing: VideoProcessingService,
    private readonly images: ExerciseImagesService,
    private readonly urls: MediaUrlService,
    private readonly mapper: ExerciseMediaMapper,
  ) {}

  // ─── Reads ────────────────────────────────────────────────

  async listForExercise(
    exerciseId: string,
    filter: { kind?: ExerciseVideo['kind']; includeUnready?: boolean } = {},
    options: MapperOptions = {},
  ): Promise<ExerciseVideoResponse[]> {
    await this.requireExercise(exerciseId);
    const videos = await this.repository.findVideosByExercise(exerciseId, filter);
    return this.mapper.toVideos(videos, options);
  }

  async list(dto: ListExerciseVideosDto, options: MapperOptions = {}): Promise<PaginatedVideos> {
    const { items, total } = await this.repository.listVideos(
      {
        exerciseId: dto.exerciseId,
        kind: dto.kind,
        status: dto.status,
        includeUnready: options.includeStorageDetails === true,
      },
      { limit: dto.limit, offset: dto.offset },
    );

    return {
      items: await this.mapper.toVideos(items, options),
      total,
      limit: dto.limit,
      offset: dto.offset,
    };
  }

  async get(id: string, options: MapperOptions = {}): Promise<ExerciseVideoResponse> {
    const video = await this.requireVideo(id);

    if (!options.includeStorageDetails && video.status !== 'ready') {
      // An unfinished upload is not a resource the app gets to see.
      throw new NotFoundException('Video not found.');
    }

    return this.mapper.toVideo(video, options);
  }

  /**
   * The URL the player should open.
   *
   * Public objects resolve to their CDN URL; private ones to a signed URL that
   * expires. Either way the response carries the shape of the video, so the client
   * can lay out the player before a single byte of media arrives.
   */
  async createPlaybackUrl(id: string, dto: PlaybackUrlDto = {}): Promise<PlaybackUrlResponse> {
    const video = await this.requireVideo(id);

    if (video.status !== 'ready') {
      throw new ConflictException(
        video.status === 'failed'
          ? 'This video failed to process and cannot be played.'
          : 'This video is still being processed. Try again shortly.',
      );
    }

    const resolved = await this.urls.resolve(video, dto.expiresIn);
    if (!resolved.url) {
      throw new ServiceUnavailableException(
        'A playback URL could not be produced for this video. Check the storage configuration.',
      );
    }

    const mapped = await this.mapper.toVideo(video);

    return {
      videoId: video.id,
      url: resolved.url,
      expiresAt: resolved.expiresAt?.toISOString() ?? null,
      mimeType: video.mimeType,
      durationSeconds: video.durationSeconds,
      width: video.width,
      height: video.height,
      orientation: mapped.orientation,
      thumbnailUrl: mapped.thumbnailUrl,
      streaming: 'progressive',
    };
  }

  // ─── Upload through the API ───────────────────────────────

  async upload(
    exerciseId: string,
    file: UploadedFile | undefined,
    dto: UploadExerciseVideoDto,
    uploadedById: string,
  ): Promise<ExerciseVideoUploadResponse> {
    await this.requireExercise(exerciseId);

    const validated = this.validation.validateVideo(file);
    const visibility = this.storage.resolveVisibility(dto.visibility);
    const metadata = await this.processing.probe(validated.buffer, validated.extension);

    const key = this.storage.createObjectKey([exerciseId, 'videos'], validated.extension);
    const stored = await this.storage.upload({
      key,
      body: validated.buffer,
      contentType: validated.mimeType,
      metadata: { exerciseId, kind: dto.kind },
    });

    const thumbnail = await this.tryGenerateThumbnail(
      exerciseId,
      validated.buffer,
      validated.extension,
      metadata.durationSeconds,
      visibility,
      uploadedById,
      dto.thumbnailAltText ?? null,
    );

    let created: ExerciseVideo;
    try {
      created = await this.repository.insertVideo({
        exerciseId,
        kind: dto.kind,
        label: dto.label ?? null,
        provider: this.storage.providerName,
        storageKey: stored.key,
        visibility,
        publicUrl: visibility === 'public' ? stored.publicUrl : null,
        thumbnailImageId: thumbnail?.id ?? null,
        durationSeconds: metadata.durationSeconds,
        width: metadata.width,
        height: metadata.height,
        fileSize: stored.size,
        mimeType: stored.contentType,
        checksumSha256: validated.checksumSha256,
        status: 'ready',
        orderIndex: dto.orderIndex,
        uploadedById,
        uploadedAt: new Date(),
      });
    } catch (error) {
      // Nothing references the bytes we just wrote — take them back out.
      this.logger.error(`Rolling back ${stored.key} after a failed insert`, error as Error);
      await this.storage.deleteQuietly([stored.key]);
      if (thumbnail) await this.images.remove(thumbnail.id).catch(() => undefined);
      throw error;
    }

    return this.describeUpload({ ...created, thumbnail }, metadata, validated.mimeType, thumbnail);
  }

  /** Swap the file behind an existing video row, keeping its id and placement. */
  async replaceFile(
    id: string,
    file: UploadedFile | undefined,
    uploadedById: string,
  ): Promise<ExerciseVideoUploadResponse> {
    const existing = await this.requireVideo(id);
    const validated = this.validation.validateVideo(file);
    const metadata = await this.processing.probe(validated.buffer, validated.extension);

    const key = this.storage.createObjectKey(
      [existing.exerciseId, 'videos'],
      validated.extension,
    );
    const stored = await this.storage.upload({
      key,
      body: validated.buffer,
      contentType: validated.mimeType,
      metadata: { exerciseId: existing.exerciseId, kind: existing.kind },
    });

    const thumbnail = await this.tryGenerateThumbnail(
      existing.exerciseId,
      validated.buffer,
      validated.extension,
      metadata.durationSeconds,
      existing.visibility,
      uploadedById,
      existing.thumbnail?.altText ?? null,
    );

    const updated = await this.repository.updateVideo(id, {
      provider: this.storage.providerName,
      storageKey: stored.key,
      publicUrl: existing.visibility === 'public' ? stored.publicUrl : null,
      durationSeconds: metadata.durationSeconds,
      width: metadata.width,
      height: metadata.height,
      fileSize: stored.size,
      mimeType: stored.contentType,
      checksumSha256: validated.checksumSha256,
      status: 'ready',
      errorMessage: null,
      thumbnailImageId: thumbnail?.id ?? existing.thumbnailImageId,
      uploadedById,
      uploadedAt: new Date(),
    });

    if (!updated) {
      await this.storage.deleteQuietly([stored.key]);
      throw new NotFoundException('Video not found.');
    }

    // The row now points at the new object, so the old one is unreferenced. Same
    // for a superseded auto-generated thumbnail.
    await this.storage.deleteQuietly([existing.storageKey]);
    if (thumbnail && existing.thumbnailImageId) {
      await this.images.remove(existing.thumbnailImageId).catch(() => undefined);
    }

    const record: ExerciseVideoRecord = { ...updated, thumbnail: thumbnail ?? existing.thumbnail };
    return this.describeUpload(record, metadata, validated.mimeType, thumbnail);
  }

  // ─── Direct-to-bucket upload ──────────────────────────────

  /**
   * Reserve a row and hand back a signed PUT URL.
   *
   * The row is created `pending` so the id exists before the bytes do — that id is
   * what `complete` uses, and what the abandoned-upload sweep looks for if the
   * client never comes back.
   */
  async createDirectUploadUrl(
    exerciseId: string,
    dto: CreateUploadUrlDto,
    uploadedById: string,
  ): Promise<DirectUploadTicket> {
    await this.requireExercise(exerciseId);

    this.validation.assertUploadableVideoType(dto.contentType);
    this.validation.assertUploadableSize(dto.fileSize);

    const visibility = this.storage.resolveVisibility(dto.visibility);
    const key = this.storage.createObjectKey(
      [exerciseId, 'videos'],
      extensionForVideoMimeType(dto.contentType),
    );

    const signed = await this.storage.createSignedUploadUrl(key, {
      contentType: dto.contentType,
      contentLength: dto.fileSize,
      expiresInSeconds: this.storage.uploadUrlTtlSeconds,
    });

    const created = await this.repository.insertVideo({
      exerciseId,
      kind: dto.kind,
      label: dto.label ?? null,
      provider: this.storage.providerName,
      storageKey: key,
      visibility,
      publicUrl: null,
      mimeType: dto.contentType,
      fileSize: dto.fileSize,
      status: 'pending',
      orderIndex: dto.orderIndex,
      uploadedById,
    });

    return {
      videoId: created.id,
      uploadUrl: signed.url,
      expiresAt: signed.expiresAt.toISOString(),
      requiredHeaders: {
        'Content-Type': dto.contentType,
        'Content-Length': String(dto.fileSize),
      },
      method: 'PUT',
    };
  }

  /**
   * Verify what actually landed in the bucket and publish the row.
   *
   * The object is re-checked here rather than trusted: the size and content type
   * come from the bucket itself, and a key with nothing behind it stays `pending`.
   */
  async completeDirectUpload(
    id: string,
    dto: CompleteUploadDto,
  ): Promise<ExerciseVideoUploadResponse> {
    const video = await this.requireVideo(id);

    if (video.status === 'ready') {
      throw new ConflictException('This upload has already been completed.');
    }

    const object = await this.storage.head(video.storageKey);
    if (!object) {
      throw new BadRequestException(
        'No object was found at the reserved key. PUT the file to the upload URL before completing.',
      );
    }

    this.validation.assertUploadableSize(object.size);
    const mimeType = object.contentType ?? video.mimeType ?? 'video/mp4';
    this.validation.assertUploadableVideoType(mimeType);

    const updated = await this.repository.updateVideo(id, {
      status: 'ready',
      fileSize: object.size,
      mimeType,
      durationSeconds: dto.durationSeconds ?? video.durationSeconds,
      width: dto.width ?? video.width,
      height: dto.height ?? video.height,
      publicUrl:
        video.visibility === 'public' ? this.storage.getPublicUrl(video.storageKey) : null,
      errorMessage: null,
      uploadedAt: new Date(),
    });

    if (!updated) throw new NotFoundException('Video not found.');

    const warnings = [
      // The bytes were never on this machine, so nothing could probe them.
      dto.width && dto.height
        ? null
        : 'Dimensions were not provided, so the player cannot reserve the right aspect ratio. Send width and height when completing the upload.',
      video.thumbnailImageId
        ? null
        : 'No thumbnail is attached. Upload one via POST /exercise-videos/:id/thumbnail so lists have a poster frame.',
    ].filter((warning): warning is string => warning !== null);

    return {
      video: await this.mapper.toVideo(
        { ...updated, thumbnail: video.thumbnail },
        { includeStorageDetails: true },
      ),
      thumbnail: video.thumbnail
        ? await this.mapper.toImage(video.thumbnail, { includeStorageDetails: true })
        : null,
      warnings,
    };
  }

  // ─── Mutations ────────────────────────────────────────────

  async update(id: string, dto: UpdateExerciseVideoDto): Promise<ExerciseVideoResponse> {
    const existing = await this.requireVideo(id);
    const visibility = dto.visibility ? this.storage.resolveVisibility(dto.visibility) : undefined;

    const updated = await this.repository.updateVideo(id, {
      kind: dto.kind,
      label: dto.label === undefined ? undefined : dto.label,
      orderIndex: dto.orderIndex,
      visibility,
      publicUrl:
        visibility === undefined
          ? undefined
          : visibility === 'public'
            ? this.storage.getPublicUrl(existing.storageKey)
            : null,
    });

    if (!updated) throw new NotFoundException('Video not found.');

    // A video's thumbnail follows its visibility, or a private video would show a
    // public poster frame.
    if (visibility && existing.thumbnailImageId) {
      await this.images.update(existing.thumbnailImageId, { visibility }).catch((error) => {
        this.logger.warn(`Could not align thumbnail visibility for video ${id}: ${error}`);
      });
    }

    const record = await this.repository.findVideo(id);
    return this.mapper.toVideo(record ?? { ...updated }, { includeStorageDetails: true });
  }

  async remove(id: string): Promise<{ success: true; id: string }> {
    const existing = await this.requireVideo(id);

    const deleted = await this.repository.deleteVideo(id);
    if (!deleted) throw new NotFoundException('Video not found.');

    await this.storage.deleteQuietly([existing.storageKey]);

    // Only remove the poster frame if nothing else adopted it in the meantime.
    if (existing.thumbnailImageId) {
      const stillUsed = await this.repository.findVideosUsingThumbnail(existing.thumbnailImageId);
      if (stillUsed.length === 0) {
        await this.images.remove(existing.thumbnailImageId).catch(() => undefined);
      }
    }

    return { success: true, id };
  }

  // ─── Thumbnails ───────────────────────────────────────────

  /** Upload (or replace) the poster frame of a specific video. */
  async setThumbnail(
    videoId: string,
    file: UploadedFile | undefined,
    dto: UploadVideoThumbnailDto,
    uploadedById: string,
  ): Promise<ExerciseVideoResponse> {
    const video = await this.requireVideo(videoId);
    const previousThumbnailId = video.thumbnailImageId;

    const uploaded = await this.images.upload(
      video.exerciseId,
      file,
      {
        kind: 'thumbnail',
        altText: dto.altText,
        orderIndex: 0,
        // A thumbnail must be at least as reachable as the video it fronts.
        visibility: dto.visibility ?? video.visibility,
      },
      uploadedById,
    );

    const updated = await this.repository.updateVideo(videoId, {
      thumbnailImageId: uploaded.id,
    });
    if (!updated) throw new NotFoundException('Video not found.');

    if (previousThumbnailId && previousThumbnailId !== uploaded.id) {
      await this.images.remove(previousThumbnailId).catch(() => undefined);
    }

    const record = await this.repository.findVideo(videoId);
    return this.mapper.toVideo(record ?? { ...updated }, { includeStorageDetails: true });
  }

  async removeThumbnail(videoId: string): Promise<ExerciseVideoResponse> {
    const video = await this.requireVideo(videoId);
    if (!video.thumbnailImageId) {
      throw new NotFoundException('This video has no thumbnail.');
    }

    // Clearing the reference first means the video is never left pointing at a
    // row that is about to disappear.
    await this.repository.updateVideo(videoId, { thumbnailImageId: null });
    await this.images.remove(video.thumbnailImageId);

    const record = await this.repository.findVideo(videoId);
    return this.mapper.toVideo(record!, { includeStorageDetails: true });
  }

  // ─── Internals ────────────────────────────────────────────

  private async describeUpload(
    record: ExerciseVideoRecord,
    metadata: VideoMetadata,
    mimeType: string,
    thumbnail: ExerciseImage | null,
  ): Promise<ExerciseVideoUploadResponse> {
    const warnings = this.processing.compatibilityWarnings(metadata, mimeType);

    if (!metadata.width || !metadata.height) {
      warnings.push(
        'Duration and dimensions could not be measured (ffprobe is unavailable), so the player cannot reserve the video\'s aspect ratio.',
      );
    }
    if (!thumbnail && !record.thumbnailImageId) {
      warnings.push(
        'No thumbnail could be generated (ffmpeg is unavailable). Upload one via POST /exercise-videos/:id/thumbnail.',
      );
    }

    return {
      video: await this.mapper.toVideo(record, { includeStorageDetails: true }),
      thumbnail: thumbnail
        ? await this.mapper.toImage(thumbnail, { includeStorageDetails: true })
        : null,
      warnings,
    };
  }

  /**
   * Cut and store a poster frame. Never fatal: a video without a thumbnail is a
   * cosmetic gap, and failing the upload over it would be worse.
   */
  private async tryGenerateThumbnail(
    exerciseId: string,
    buffer: Buffer,
    extension: string,
    durationSeconds: number | null,
    visibility: ExerciseVideo['visibility'],
    uploadedById: string,
    altText: string | null,
  ): Promise<ExerciseImage | null> {
    try {
      const generated = await this.processing.generateThumbnail(buffer, extension, durationSeconds);
      if (!generated) return null;

      return await this.images.storeGenerated(
        exerciseId,
        { ...generated, altText },
        { kind: 'thumbnail', visibility, uploadedById },
      );
    } catch (error) {
      this.logger.warn(`Thumbnail generation failed for exercise ${exerciseId}: ${error}`);
      return null;
    }
  }

  private async requireVideo(id: string): Promise<ExerciseVideoRecord> {
    const video = await this.repository.findVideo(id);
    if (!video) throw new NotFoundException('Video not found.');
    return video;
  }

  private async requireExercise(exerciseId: string) {
    const exercise = await this.repository.findExercise(exerciseId);
    if (!exercise) throw new NotFoundException('Exercise not found.');
    return exercise;
  }
}
