import { z } from 'zod';
import { ACCEPTED_VIDEO_MIME_TYPES } from '../media-file.util';

/**
 * Validation for the video endpoints.
 *
 * Multipart fields arrive as strings, so anything numeric or boolean is coerced
 * here rather than parsed by hand in the controller.
 */

export const uuidParamSchema = z.string().uuid('That is not a valid id.');

export const videoKindSchema = z.enum(['primary', 'preview', 'alternate_angle']);
export const visibilitySchema = z.enum(['public', 'private']);

/** Label is free text; length is capped to the column width. */
const labelSchema = z.string().trim().min(1).max(120);

export const uploadExerciseVideoSchema = z.object({
  kind: videoKindSchema.default('primary'),
  label: labelSchema.optional(),
  orderIndex: z.coerce.number().int().min(0).max(999).default(0),
  /** Omit to use the server default (`MEDIA_DEFAULT_VISIBILITY`). */
  visibility: visibilitySchema.optional(),
  /** Alt text for the thumbnail generated from the video's first seconds. */
  thumbnailAltText: z.string().trim().max(255).optional(),
});

export type UploadExerciseVideoDto = z.infer<typeof uploadExerciseVideoSchema>;

/**
 * Metadata-only update. Status, dimensions and the storage key are server-owned:
 * accepting them from a request would let a caller mark a broken upload ready.
 */
export const updateExerciseVideoSchema = z
  .object({
    kind: videoKindSchema.optional(),
    label: labelSchema.nullable().optional(),
    orderIndex: z.coerce.number().int().min(0).max(999).optional(),
    visibility: visibilitySchema.optional(),
  })
  .refine((value) => Object.keys(value).length > 0, {
    message: 'Provide at least one field to update.',
  });

export type UpdateExerciseVideoDto = z.infer<typeof updateExerciseVideoSchema>;

export const listExerciseVideosSchema = z.object({
  exerciseId: z.string().uuid().optional(),
  kind: videoKindSchema.optional(),
  status: z.enum(['pending', 'processing', 'ready', 'failed']).optional(),
  limit: z.coerce.number().int().min(1).max(100).default(25),
  offset: z.coerce.number().int().min(0).default(0),
});

export type ListExerciseVideosDto = z.infer<typeof listExerciseVideosSchema>;

/**
 * Request for a direct-to-bucket upload URL.
 *
 * Size and content type are declared up front so both can be signed into the URL
 * — the bucket then rejects a body that does not match, rather than trusting the
 * client to behave.
 */
export const createUploadUrlSchema = z.object({
  contentType: z.enum(ACCEPTED_VIDEO_MIME_TYPES as [string, ...string[]], {
    errorMap: () => ({
      message: `contentType must be one of: ${ACCEPTED_VIDEO_MIME_TYPES.join(', ')}.`,
    }),
  }),
  fileSize: z.coerce.number().int().positive('fileSize must be the byte length of the file.'),
  kind: videoKindSchema.default('primary'),
  label: labelSchema.optional(),
  orderIndex: z.coerce.number().int().min(0).max(999).default(0),
  visibility: visibilitySchema.optional(),
});

export type CreateUploadUrlDto = z.infer<typeof createUploadUrlSchema>;

/**
 * Finalises a direct upload. The server re-checks the object in the bucket; the
 * optional measurements are accepted only because the bytes were never on this
 * machine to probe.
 */
export const completeUploadSchema = z.object({
  durationSeconds: z.coerce.number().positive().max(3600).optional(),
  width: z.coerce.number().int().positive().max(7680).optional(),
  height: z.coerce.number().int().positive().max(7680).optional(),
});

export type CompleteUploadDto = z.infer<typeof completeUploadSchema>;

/** Playback URL request. The TTL is bounded so a link cannot be made long-lived. */
export const playbackUrlSchema = z.object({
  expiresIn: z.coerce.number().int().min(60).max(86400).optional(),
});

export type PlaybackUrlDto = z.infer<typeof playbackUrlSchema>;
