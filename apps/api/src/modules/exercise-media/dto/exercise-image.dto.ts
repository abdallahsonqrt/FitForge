import { z } from 'zod';
import { visibilitySchema } from './exercise-video.dto';

/**
 * Validation for the image endpoints.
 *
 * `thumbnail` is the poster frame of a video, `poster` a hand-designed cover,
 * `preview_gif` the short looping teaser used in lists, and `illustration` an
 * anatomical diagram.
 */
export const imageKindSchema = z.enum(['thumbnail', 'poster', 'preview_gif', 'illustration']);

export const uploadExerciseImageSchema = z.object({
  kind: imageKindSchema.default('thumbnail'),
  altText: z.string().trim().max(255).optional(),
  orderIndex: z.coerce.number().int().min(0).max(999).default(0),
  visibility: visibilitySchema.optional(),
});

export type UploadExerciseImageDto = z.infer<typeof uploadExerciseImageSchema>;

export const updateExerciseImageSchema = z
  .object({
    kind: imageKindSchema.optional(),
    altText: z.string().trim().max(255).nullable().optional(),
    orderIndex: z.coerce.number().int().min(0).max(999).optional(),
    visibility: visibilitySchema.optional(),
  })
  .refine((value) => Object.keys(value).length > 0, {
    message: 'Provide at least one field to update.',
  });

export type UpdateExerciseImageDto = z.infer<typeof updateExerciseImageSchema>;

/** Thumbnail upload for a specific video — kind is implied, so only alt text applies. */
export const uploadVideoThumbnailSchema = z.object({
  altText: z.string().trim().max(255).optional(),
  visibility: visibilitySchema.optional(),
});

export type UploadVideoThumbnailDto = z.infer<typeof uploadVideoThumbnailSchema>;

export const listExerciseImagesSchema = z.object({
  kind: imageKindSchema.optional(),
});

export type ListExerciseImagesDto = z.infer<typeof listExerciseImagesSchema>;
