import { Injectable } from '@nestjs/common';
import type { ExerciseImage } from '../../database/schema';
import { MediaUrlService } from './media-url.service';
import {
  ExerciseImageResponse,
  ExerciseVideoRecord,
  ExerciseVideoResponse,
  MediaOrientation,
} from './exercise-media.types';

/** Whether to include the storage internals only an admin has any use for. */
export interface MapperOptions {
  includeStorageDetails?: boolean;
  /** Overrides the configured signed-URL lifetime, when a caller asked for one. */
  expiresInSeconds?: number;
}

/**
 * Database rows → wire shapes.
 *
 * Mapping is a service rather than a pure function because a URL may have to be
 * signed, which is asynchronous and needs the storage layer.
 */
@Injectable()
export class ExerciseMediaMapper {
  constructor(private readonly urls: MediaUrlService) {}

  async toVideo(
    record: ExerciseVideoRecord,
    options: MapperOptions = {},
  ): Promise<ExerciseVideoResponse> {
    const [playback, thumbnailUrl] = await Promise.all([
      this.urls.resolve(record, options.expiresInSeconds),
      this.urls.resolveUrl(record.thumbnail ?? null, options.expiresInSeconds),
    ]);

    const response: ExerciseVideoResponse = {
      id: record.id,
      exerciseId: record.exerciseId,
      kind: record.kind,
      label: record.label,
      status: record.status,
      visibility: record.visibility,

      url: playback.url,
      urlExpiresAt: playback.expiresAt?.toISOString() ?? null,
      thumbnailUrl,

      durationSeconds: record.durationSeconds,
      width: record.width,
      height: record.height,
      aspectRatio: aspectRatio(record.width, record.height),
      orientation: orientation(record.width, record.height),

      mimeType: record.mimeType,
      fileSize: record.fileSize,
      orderIndex: record.orderIndex,
      uploadedAt: record.uploadedAt?.toISOString() ?? null,
      createdAt: record.createdAt.toISOString(),
      updatedAt: record.updatedAt.toISOString(),
    };

    if (options.includeStorageDetails) {
      response.provider = record.provider;
      response.storageKey = record.storageKey;
      response.checksumSha256 = record.checksumSha256;
      response.errorMessage = record.errorMessage;
    }

    return response;
  }

  /** Resolved in parallel: signing N URLs serially would dominate a list request. */
  async toVideos(
    records: ExerciseVideoRecord[],
    options: MapperOptions = {},
  ): Promise<ExerciseVideoResponse[]> {
    return Promise.all(records.map((record) => this.toVideo(record, options)));
  }

  async toImage(
    record: ExerciseImage,
    options: MapperOptions = {},
  ): Promise<ExerciseImageResponse> {
    const resolved = await this.urls.resolve(record, options.expiresInSeconds);

    const response: ExerciseImageResponse = {
      id: record.id,
      exerciseId: record.exerciseId,
      kind: record.kind,
      url: resolved.url,
      urlExpiresAt: resolved.expiresAt?.toISOString() ?? null,
      width: record.width,
      height: record.height,
      altText: record.altText,
      orderIndex: record.orderIndex,
      mimeType: record.mimeType,
      fileSize: record.fileSize,
      createdAt: record.createdAt.toISOString(),
    };

    if (options.includeStorageDetails) {
      response.provider = record.provider;
      response.storageKey = record.storageKey;
      response.checksumSha256 = record.checksumSha256;
    }

    return response;
  }

  async toImages(
    records: ExerciseImage[],
    options: MapperOptions = {},
  ): Promise<ExerciseImageResponse[]> {
    return Promise.all(records.map((record) => this.toImage(record, options)));
  }
}

const aspectRatio = (width: number | null, height: number | null): number | null =>
  width && height ? Number((width / height).toFixed(4)) : null;

const orientation = (width: number | null, height: number | null): MediaOrientation | null => {
  if (!width || !height) return null;
  if (width === height) return 'square';
  return width > height ? 'landscape' : 'portrait';
};
