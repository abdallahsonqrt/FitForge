import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { existsSync } from 'node:fs';
import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { readImageDimensions } from './media-file.util';

const run = promisify(execFile);

/** Long enough for a 30-second clip on a busy box, short enough to fail a request. */
const PROCESS_TIMEOUT_MS = 60_000;
/** ffprobe's JSON for a short clip is a few KB; this is generous headroom. */
const MAX_OUTPUT_BYTES = 8 * 1024 * 1024;

/** Longest edge of the generated poster frame — 720p-friendly, small enough for a list. */
const THUMBNAIL_LONG_EDGE = 720;

export interface VideoMetadata {
  durationSeconds: number | null;
  width: number | null;
  height: number | null;
  videoCodec: string | null;
  audioCodec: string | null;
  bitrate: number | null;
}

export interface GeneratedThumbnail {
  buffer: Buffer;
  mimeType: string;
  extension: string;
  width: number | null;
  height: number | null;
}

/** Shape of the ffprobe JSON we read, narrowed to the fields used. */
interface ProbeOutput {
  streams?: {
    codec_type?: string;
    codec_name?: string;
    width?: number;
    height?: number;
    duration?: string;
    tags?: { rotate?: string };
    side_data_list?: { rotation?: number }[];
  }[];
  format?: { duration?: string; bit_rate?: string };
}

/**
 * Reads a video's real shape and cuts its poster frame.
 *
 * Both jobs need a decoder, so both are delegated to ffmpeg/ffprobe. The binaries
 * are *optional*: resolved from `FFMPEG_PATH`/`FFPROBE_PATH`, then the bundled
 * `ffmpeg-static`/`ffprobe-static` packages, then `PATH`. When none is available
 * an upload still succeeds — it simply arrives without measurements or an
 * automatic thumbnail, and an admin can upload a thumbnail by hand. That keeps a
 * developer machine with no ffmpeg from being unable to run the feature at all,
 * while a properly provisioned server gets the full pipeline.
 */
@Injectable()
export class VideoProcessingService {
  private readonly logger = new Logger(VideoProcessingService.name);

  /** Resolved lazily and cached: `undefined` = not looked up yet, `null` = unavailable. */
  private ffmpegPath: string | null | undefined;
  private ffprobePath: string | null | undefined;

  constructor(private readonly config: ConfigService) {}

  async isAvailable(): Promise<boolean> {
    return (await this.resolveFfprobe()) !== null;
  }

  /**
   * Duration, dimensions and codecs, or nulls when ffprobe is unavailable or the
   * file cannot be read. Never throws: metadata is valuable but not worth failing
   * an otherwise good upload over.
   */
  async probe(buffer: Buffer, extension: string): Promise<VideoMetadata> {
    const empty: VideoMetadata = {
      durationSeconds: null,
      width: null,
      height: null,
      videoCodec: null,
      audioCodec: null,
      bitrate: null,
    };

    const ffprobe = await this.resolveFfprobe();
    if (!ffprobe) return empty;

    return this.withTempFile(buffer, extension, async (inputPath) => {
      try {
        const { stdout } = await run(
          ffprobe,
          ['-v', 'error', '-print_format', 'json', '-show_format', '-show_streams', inputPath],
          { timeout: PROCESS_TIMEOUT_MS, maxBuffer: MAX_OUTPUT_BYTES },
        );

        return this.readProbeOutput(JSON.parse(stdout) as ProbeOutput);
      } catch (error) {
        this.logger.warn(`ffprobe failed; storing the video without metadata: ${describe(error)}`);
        return empty;
      }
    });
  }

  /**
   * Extract a single frame as a JPEG poster.
   *
   * The frame is taken a moment in rather than at zero — the first frame of a
   * demo is usually the lifter still walking into position, and many encoders
   * start on black.
   */
  async generateThumbnail(
    buffer: Buffer,
    extension: string,
    durationSeconds: number | null,
  ): Promise<GeneratedThumbnail | null> {
    const ffmpeg = await this.resolveFfmpeg();
    if (!ffmpeg) return null;

    const seekSeconds = this.pickThumbnailTimestamp(durationSeconds);

    return this.withTempFile(buffer, extension, async (inputPath, directory) => {
      const outputPath = join(directory, 'thumbnail.jpg');

      try {
        await run(
          ffmpeg,
          [
            '-v', 'error',
            '-y',
            // Before -i: seeks by keyframe, which is far cheaper than decoding to
            // the timestamp and is accurate enough for a poster frame.
            '-ss', seekSeconds.toFixed(3),
            '-i', inputPath,
            '-frames:v', '1',
            // Fit inside a 720-square box rather than forcing a width: a portrait
            // clip scaled to 720 *wide* would produce a 720×1280 poster, several
            // times the bytes of the frame anyone actually sees. `force_divisible_by`
            // keeps both sides even, which the JPEG encoder requires.
            '-vf',
            `scale=w=${THUMBNAIL_LONG_EDGE}:h=${THUMBNAIL_LONG_EDGE}:force_original_aspect_ratio=decrease:force_divisible_by=2`,
            '-q:v', '3',
            outputPath,
          ],
          { timeout: PROCESS_TIMEOUT_MS, maxBuffer: MAX_OUTPUT_BYTES },
        );

        const thumbnail = await readFile(outputPath);
        if (thumbnail.byteLength === 0) return null;

        // Read the size back off the JPEG rather than deriving it from the scale
        // filter's arithmetic — the header is the authority, and the client uses
        // these to reserve layout space.
        const dimensions = readImageDimensions(thumbnail);

        return {
          buffer: thumbnail,
          mimeType: 'image/jpeg',
          extension: 'jpg',
          width: dimensions?.width ?? null,
          height: dimensions?.height ?? null,
        };
      } catch (error) {
        this.logger.warn(`Thumbnail extraction failed: ${describe(error)}`);
        return null;
      }
    });
  }

  /**
   * Advisory notes returned with the upload, so an admin learns that a clip will
   * play badly on phones *before* users do.
   */
  compatibilityWarnings(metadata: VideoMetadata, mimeType: string): string[] {
    const warnings: string[] = [];

    if (mimeType !== 'video/mp4') {
      warnings.push(
        `Stored as ${mimeType}. MP4 (H.264 + AAC) is the only container that plays on every iOS and Android version without a fallback.`,
      );
    }
    if (metadata.videoCodec && !['h264', 'avc1'].includes(metadata.videoCodec)) {
      warnings.push(
        `Video codec is ${metadata.videoCodec}; H.264 is recommended for mobile playback.`,
      );
    }
    if (metadata.audioCodec && metadata.audioCodec !== 'aac') {
      warnings.push(`Audio codec is ${metadata.audioCodec}; AAC is recommended for mobile playback.`);
    }
    const shortestSide =
      metadata.width && metadata.height ? Math.min(metadata.width, metadata.height) : null;
    if (shortestSide && shortestSide > 1080) {
      warnings.push(
        `Resolution is ${metadata.width}×${metadata.height}. 720p is the recommended default — larger files start slower on mobile data for no visible gain.`,
      );
    }
    if (metadata.durationSeconds && metadata.durationSeconds > 60) {
      warnings.push(
        `Clip is ${Math.round(metadata.durationSeconds)}s. Instructional demos work best at 10–30 seconds.`,
      );
    }

    return warnings;
  }

  // ─── Internals ────────────────────────────────────────────

  private readProbeOutput(probe: ProbeOutput): VideoMetadata {
    const video = probe.streams?.find((stream) => stream.codec_type === 'video');
    const audio = probe.streams?.find((stream) => stream.codec_type === 'audio');

    const duration = Number(video?.duration ?? probe.format?.duration ?? NaN);
    const bitrate = Number(probe.format?.bit_rate ?? NaN);

    // A phone recording a portrait clip usually stores a landscape frame plus a
    // rotation of ±90°. The player honours the rotation, so the *displayed*
    // dimensions are what the client needs to reserve layout space.
    const rotation = Math.abs(
      video?.side_data_list?.find((entry) => entry.rotation !== undefined)?.rotation ??
        Number(video?.tags?.rotate ?? 0),
    );
    const isQuarterTurned = rotation === 90 || rotation === 270;

    const width = video?.width ?? null;
    const height = video?.height ?? null;

    return {
      durationSeconds: Number.isFinite(duration) ? Number(duration.toFixed(3)) : null,
      width: isQuarterTurned ? height : width,
      height: isQuarterTurned ? width : height,
      videoCodec: video?.codec_name ?? null,
      audioCodec: audio?.codec_name ?? null,
      bitrate: Number.isFinite(bitrate) ? bitrate : null,
    };
  }

  private pickThumbnailTimestamp(durationSeconds: number | null): number {
    if (!durationSeconds || durationSeconds <= 0) return 0;
    // A quarter in, capped at one second, and never past the end of a very short clip.
    return Math.min(1, durationSeconds * 0.25);
  }

  /**
   * ffmpeg needs a seekable file, so the buffer is written to a private temp
   * directory that is removed however the callback ends.
   */
  private async withTempFile<T>(
    buffer: Buffer,
    extension: string,
    work: (inputPath: string, directory: string) => Promise<T>,
  ): Promise<T> {
    const directory = await mkdtemp(join(tmpdir(), 'fitforge-media-'));
    const inputPath = join(directory, `source.${extension}`);

    try {
      await writeFile(inputPath, buffer);
      return await work(inputPath, directory);
    } finally {
      await rm(directory, { recursive: true, force: true }).catch(() => undefined);
    }
  }

  private async resolveFfmpeg(): Promise<string | null> {
    if (this.ffmpegPath === undefined) {
      this.ffmpegPath = await this.locate('FFMPEG_PATH', 'ffmpeg-static', 'ffmpeg');
    }
    return this.ffmpegPath;
  }

  private async resolveFfprobe(): Promise<string | null> {
    if (this.ffprobePath === undefined) {
      this.ffprobePath = await this.locate('FFPROBE_PATH', 'ffprobe-static', 'ffprobe');
    }
    return this.ffprobePath;
  }

  /**
   * First candidate that answers `-version` wins: the configured path, then the
   * binary bundled by the optional static package, then whatever is on `PATH`.
   */
  private async locate(
    envKey: string,
    packageName: string,
    binaryName: string,
  ): Promise<string | null> {
    const candidates = [
      this.config.get<string>(envKey),
      this.fromStaticPackage(packageName),
      binaryName,
    ].filter((candidate): candidate is string => Boolean(candidate));

    for (const candidate of candidates) {
      try {
        await run(candidate, ['-version'], { timeout: 10_000, maxBuffer: MAX_OUTPUT_BYTES });
        this.logger.log(`Using ${binaryName} at "${candidate}"`);
        return candidate;
      } catch {
        // Try the next candidate.
      }
    }

    this.logger.warn(
      `${binaryName} was not found (checked ${envKey}, the ${packageName} package, and PATH). ` +
        'Videos will be stored without duration/dimensions and without an automatic thumbnail.',
    );
    return null;
  }

  /**
   * `ffmpeg-static` and `ffprobe-static` are optional dependencies — a machine
   * that skipped them, or a platform they have no build for, must not crash the
   * module at import time.
   */
  private fromStaticPackage(packageName: string): string | null {
    try {
      // A runtime `require` is the point here — see the doc comment above. The
      // rule was renamed in @typescript-eslint v8, so both names are listed to
      // keep the suppression working across versions.
      // eslint-disable-next-line @typescript-eslint/no-var-requires, @typescript-eslint/no-require-imports
      const resolved = require(packageName) as string | { path?: string; default?: string };
      const path =
        typeof resolved === 'string' ? resolved : (resolved?.path ?? resolved?.default ?? null);
      return path && existsSync(path) ? path : null;
    } catch {
      return null;
    }
  }
}

const describe = (error: unknown): string =>
  error instanceof Error ? error.message : String(error);
