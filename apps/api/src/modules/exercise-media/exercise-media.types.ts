import type { ExerciseImage, ExerciseVideo } from '../../database/schema';

/**
 * Wire shapes for exercise media.
 *
 * These are what the app sees. Storage internals (`provider`, `storageKey`,
 * `checksumSha256`) appear only in the admin variants — a player needs a URL, not
 * the layout of our bucket.
 */

export type MediaOrientation = 'portrait' | 'landscape' | 'square';

/** A video row joined with its thumbnail, as the repository returns it. */
export type ExerciseVideoRecord = ExerciseVideo & { thumbnail?: ExerciseImage | null };

export interface ExerciseImageResponse {
  id: string;
  exerciseId: string;
  kind: ExerciseImage['kind'];
  url: string | null;
  /** Set only for signed URLs; null when the URL is stable and public. */
  urlExpiresAt: string | null;
  width: number | null;
  height: number | null;
  altText: string | null;
  orderIndex: number;
  mimeType: string | null;
  fileSize: number | null;
  createdAt: string;
  // Admin-only.
  provider?: ExerciseImage['provider'];
  storageKey?: string;
  checksumSha256?: string | null;
}

export interface ExerciseVideoResponse {
  id: string;
  exerciseId: string;
  kind: ExerciseVideo['kind'];
  label: string | null;
  status: ExerciseVideo['status'];
  visibility: ExerciseVideo['visibility'];

  /** Progressive-download URL to hand straight to a video element or player. */
  url: string | null;
  urlExpiresAt: string | null;
  thumbnailUrl: string | null;

  durationSeconds: number | null;
  width: number | null;
  height: number | null;
  /** width ÷ height, so the player can reserve space before the first frame. */
  aspectRatio: number | null;
  orientation: MediaOrientation | null;

  mimeType: string | null;
  fileSize: number | null;
  orderIndex: number;
  uploadedAt: string | null;
  createdAt: string;
  updatedAt: string;

  // Admin-only.
  provider?: ExerciseVideo['provider'];
  storageKey?: string;
  checksumSha256?: string | null;
  errorMessage?: string | null;
}

/** What an upload returns: the stored video plus anything an admin should know. */
export interface ExerciseVideoUploadResponse {
  video: ExerciseVideoResponse;
  thumbnail: ExerciseImageResponse | null;
  /**
   * Non-fatal notes about mobile playback — wrong codec, oversized resolution,
   * an over-long clip, or a missing ffmpeg that left the file unmeasured.
   */
  warnings: string[];
}

/** Direct-to-bucket upload ticket: PUT the bytes here, then call `complete`. */
export interface DirectUploadTicket {
  videoId: string;
  uploadUrl: string;
  expiresAt: string;
  /** Headers the PUT must carry for the signature to verify. */
  requiredHeaders: Record<string, string>;
  method: 'PUT';
}

export interface PlaybackUrlResponse {
  videoId: string;
  url: string;
  /** Null for public objects, which do not expire. */
  expiresAt: string | null;
  mimeType: string | null;
  durationSeconds: number | null;
  width: number | null;
  height: number | null;
  orientation: MediaOrientation | null;
  thumbnailUrl: string | null;
  /** Playback model: R2 serves byte ranges, so the client streams as it goes. */
  streaming: 'progressive';
}

export interface PaginatedVideos {
  items: ExerciseVideoResponse[];
  total: number;
  limit: number;
  offset: number;
}
