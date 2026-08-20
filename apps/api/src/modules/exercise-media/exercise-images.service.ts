import { Injectable, Logger, NotFoundException } from '@nestjs/common';
import type { ExerciseImage } from '../../database/schema';
import { StorageService } from '../../storage';
import { ExerciseMediaRepository } from './exercise-media.repository';
import { ExerciseMediaMapper, MapperOptions } from './exercise-media.mapper';
import { MediaValidationService } from './media-validation.service';
import { UploadedFile } from './media-file.util';
import { ExerciseImageResponse } from './exercise-media.types';
import {
  UpdateExerciseImageDto,
  UploadExerciseImageDto,
} from './dto/exercise-image.dto';

/** An image we produced ourselves (a poster frame), so it skips upload validation. */
export interface GeneratedImage {
  buffer: Buffer;
  mimeType: string;
  extension: string;
  width?: number | null;
  height?: number | null;
  altText?: string | null;
}

/**
 * Exercise stills: thumbnails, posters, preview GIFs and illustrations.
 *
 * Every write follows the same order — put the bytes in the bucket, then record
 * the row. If the row fails the object is deleted again, so a failed request
 * cannot leave a file nothing points at; if the *object* fails, no row was
 * written and there is nothing to clean up.
 */
@Injectable()
export class ExerciseImagesService {
  private readonly logger = new Logger(ExerciseImagesService.name);

  constructor(
    private readonly repository: ExerciseMediaRepository,
    private readonly storage: StorageService,
    private readonly validation: MediaValidationService,
    private readonly mapper: ExerciseMediaMapper,
  ) {}

  async listForExercise(
    exerciseId: string,
    kind?: ExerciseImage['kind'],
    options: MapperOptions = {},
  ): Promise<ExerciseImageResponse[]> {
    await this.requireExercise(exerciseId);
    const images = await this.repository.findImagesByExercise(exerciseId, kind);
    return this.mapper.toImages(images, options);
  }

  async get(id: string, options: MapperOptions = {}): Promise<ExerciseImageResponse> {
    return this.mapper.toImage(await this.requireImage(id), options);
  }

  /** Admin upload of an arbitrary exercise image. */
  async upload(
    exerciseId: string,
    file: UploadedFile | undefined,
    dto: UploadExerciseImageDto,
    uploadedById: string,
  ): Promise<ExerciseImageResponse> {
    await this.requireExercise(exerciseId);
    const validated = this.validation.validateImage(file);

    const row = await this.store(
      exerciseId,
      {
        buffer: validated.buffer,
        mimeType: validated.mimeType,
        extension: validated.extension,
        width: validated.dimensions?.width ?? null,
        height: validated.dimensions?.height ?? null,
        altText: dto.altText ?? null,
      },
      {
        kind: dto.kind,
        orderIndex: dto.orderIndex,
        visibility: this.storage.resolveVisibility(dto.visibility),
        checksumSha256: validated.checksumSha256,
        uploadedById,
      },
    );

    return this.mapper.toImage(row, { includeStorageDetails: true });
  }

  /**
   * Store an image we generated (a poster frame cut from the video). Trusted
   * bytes, so no sniffing — but still the same key layout and cache headers.
   */
  async storeGenerated(
    exerciseId: string,
    image: GeneratedImage,
    meta: { kind: ExerciseImage['kind']; visibility: ExerciseImage['visibility']; uploadedById: string },
  ): Promise<ExerciseImage> {
    return this.store(exerciseId, image, {
      kind: meta.kind,
      orderIndex: 0,
      visibility: meta.visibility,
      uploadedById: meta.uploadedById,
    });
  }

  async update(
    id: string,
    dto: UpdateExerciseImageDto,
  ): Promise<ExerciseImageResponse> {
    const existing = await this.requireImage(id);
    const visibility = dto.visibility ? this.storage.resolveVisibility(dto.visibility) : undefined;

    const updated = await this.repository.updateImage(id, {
      kind: dto.kind,
      altText: dto.altText === undefined ? undefined : dto.altText,
      orderIndex: dto.orderIndex,
      visibility,
      // A public object needs its stable URL recorded; a private one must not
      // keep one lying around for something to serve.
      publicUrl:
        visibility === undefined
          ? undefined
          : visibility === 'public'
            ? this.storage.getPublicUrl(existing.storageKey)
            : null,
    });

    if (!updated) throw new NotFoundException('Image not found.');
    return this.mapper.toImage(updated, { includeStorageDetails: true });
  }

  /**
   * Delete the row, then the bytes.
   *
   * That order matters: if the byte delete fails we are left with an untracked
   * object the bucket's lifecycle rules will collect, whereas the reverse order
   * would leave a row pointing at nothing and a broken image in the app.
   */
  async remove(id: string): Promise<{ success: true; id: string }> {
    const existing = await this.requireImage(id);
    const deleted = await this.repository.deleteImage(id);
    if (!deleted) throw new NotFoundException('Image not found.');

    await this.storage.deleteQuietly([existing.storageKey]);
    return { success: true, id };
  }

  /** Row lookup that 404s, shared with the videos service. */
  async requireImage(id: string): Promise<ExerciseImage> {
    const image = await this.repository.findImage(id);
    if (!image) throw new NotFoundException('Image not found.');
    return image;
  }

  // ─── Internals ────────────────────────────────────────────

  private async store(
    exerciseId: string,
    image: GeneratedImage,
    meta: {
      kind: ExerciseImage['kind'];
      orderIndex: number;
      visibility: ExerciseImage['visibility'];
      checksumSha256?: string;
      uploadedById: string;
    },
  ): Promise<ExerciseImage> {
    const key = this.storage.createObjectKey([exerciseId, 'images'], image.extension);

    const stored = await this.storage.upload({
      key,
      body: image.buffer,
      contentType: image.mimeType,
      metadata: { exerciseId, kind: meta.kind },
    });

    try {
      return await this.repository.insertImage({
        exerciseId,
        kind: meta.kind,
        provider: this.storage.providerName as ExerciseImage['provider'],
        storageKey: stored.key,
        visibility: meta.visibility,
        publicUrl: meta.visibility === 'public' ? stored.publicUrl : null,
        width: image.width ?? null,
        height: image.height ?? null,
        fileSize: stored.size,
        mimeType: stored.contentType,
        checksumSha256: meta.checksumSha256 ?? null,
        altText: image.altText ?? null,
        orderIndex: meta.orderIndex,
        status: 'ready',
        uploadedById: meta.uploadedById,
        uploadedAt: new Date(),
      });
    } catch (error) {
      // The object is already in the bucket but no row references it: remove it
      // rather than leave bytes nobody can reach or account for.
      this.logger.error(`Rolling back stored object ${stored.key} after a failed insert`, error as Error);
      await this.storage.deleteQuietly([stored.key]);
      throw error;
    }
  }

  private async requireExercise(exerciseId: string) {
    const exercise = await this.repository.findExercise(exerciseId);
    if (!exercise) throw new NotFoundException('Exercise not found.');
    return exercise;
  }
}
