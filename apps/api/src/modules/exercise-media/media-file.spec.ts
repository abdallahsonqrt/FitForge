import { describe, expect, it } from 'vitest';
import {
  extensionForVideoMimeType,
  formatBytes,
  readImageDimensions,
  sha256Hex,
  sniffImageFormat,
  sniffVideoFormat,
} from './media-file.util';

/**
 * These cover the checks that decide whether a file is allowed into the bucket.
 * They are pure functions over bytes, which makes the security-relevant part of
 * the upload path the cheapest part to pin down.
 */

/** ISO base media header: 4-byte size, `ftyp`, then a brand. */
const isoHeader = (brand: string): Buffer =>
  Buffer.concat([
    Buffer.from([0, 0, 0, 0x20]),
    Buffer.from('ftyp', 'ascii'),
    Buffer.from(brand, 'ascii'),
    Buffer.alloc(16),
  ]);

describe('sniffVideoFormat', () => {
  it('reads MP4 from the ftyp brand', () => {
    expect(sniffVideoFormat(isoHeader('isom'))).toEqual({ mimeType: 'video/mp4', extension: 'mp4' });
    expect(sniffVideoFormat(isoHeader('mp42'))).toEqual({ mimeType: 'video/mp4', extension: 'mp4' });
  });

  it('distinguishes QuickTime, which phones produce', () => {
    expect(sniffVideoFormat(isoHeader('qt  '))).toEqual({
      mimeType: 'video/quicktime',
      extension: 'mov',
    });
  });

  it('reads WebM from the EBML magic number', () => {
    const webm = Buffer.concat([Buffer.from([0x1a, 0x45, 0xdf, 0xa3]), Buffer.alloc(20)]);
    expect(sniffVideoFormat(webm)).toEqual({ mimeType: 'video/webm', extension: 'webm' });
  });

  it('rejects a file that only claims to be a video', () => {
    // The exact case the sniffer exists for: a payload named `demo.mp4`.
    expect(sniffVideoFormat(Buffer.from('<?php system($_GET["c"]); ?>'.padEnd(64)))).toBeNull();
    expect(sniffVideoFormat(Buffer.alloc(4))).toBeNull();
  });
});

describe('sniffImageFormat', () => {
  it('identifies the four formats we serve', () => {
    const jpeg = Buffer.concat([Buffer.from([0xff, 0xd8, 0xff, 0xe0]), Buffer.alloc(16)]);
    const png = Buffer.concat([
      Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
      Buffer.alloc(16),
    ]);
    const gif = Buffer.concat([Buffer.from('GIF89a', 'ascii'), Buffer.alloc(16)]);
    const webp = Buffer.concat([
      Buffer.from('RIFF', 'ascii'),
      Buffer.alloc(4),
      Buffer.from('WEBP', 'ascii'),
      Buffer.alloc(16),
    ]);

    expect(sniffImageFormat(jpeg)?.extension).toBe('jpg');
    expect(sniffImageFormat(png)?.extension).toBe('png');
    expect(sniffImageFormat(gif)?.extension).toBe('gif');
    expect(sniffImageFormat(webp)?.extension).toBe('webp');
  });

  it('rejects anything else', () => {
    expect(sniffImageFormat(Buffer.from('just text, padded out to length'))).toBeNull();
  });
});

describe('readImageDimensions', () => {
  it('reads PNG dimensions from IHDR', () => {
    const png = Buffer.alloc(32);
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]).copy(png);
    png.writeUInt32BE(1280, 16);
    png.writeUInt32BE(720, 20);

    expect(readImageDimensions(png)).toEqual({ width: 1280, height: 720 });
  });

  it('reads GIF dimensions from the screen descriptor', () => {
    const gif = Buffer.alloc(16);
    Buffer.from('GIF89a', 'ascii').copy(gif);
    gif.writeUInt16LE(320, 6);
    gif.writeUInt16LE(568, 8);

    expect(readImageDimensions(gif)).toEqual({ width: 320, height: 568 });
  });

  it('walks JPEG segments to the start-of-frame', () => {
    // SOI, a 4-byte APP0 to skip past, then SOF0 with 720×1280 (portrait).
    const jpeg = Buffer.concat([
      Buffer.from([0xff, 0xd8]),
      Buffer.from([0xff, 0xe0, 0x00, 0x04, 0x00, 0x00]),
      Buffer.from([0xff, 0xc0, 0x00, 0x11, 0x08]),
      (() => {
        const frame = Buffer.alloc(6);
        frame.writeUInt16BE(1280, 0); // height
        frame.writeUInt16BE(720, 2); // width
        return frame;
      })(),
      Buffer.alloc(8),
    ]);

    expect(readImageDimensions(jpeg)).toEqual({ width: 720, height: 1280 });
  });

  it('returns null rather than guessing when the header is truncated', () => {
    const png = Buffer.alloc(12);
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]).copy(png);
    expect(readImageDimensions(png)).toBeNull();
  });
});

describe('sha256Hex', () => {
  it('is the standard digest, so a checksum can be verified elsewhere', () => {
    expect(sha256Hex(Buffer.from('abc'))).toBe(
      'ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad',
    );
  });
});

describe('extensionForVideoMimeType', () => {
  it('maps the accepted types and falls back to mp4', () => {
    expect(extensionForVideoMimeType('video/quicktime')).toBe('mov');
    expect(extensionForVideoMimeType('video/webm')).toBe('webm');
    expect(extensionForVideoMimeType('video/mp4')).toBe('mp4');
    expect(extensionForVideoMimeType('application/octet-stream')).toBe('mp4');
  });
});

describe('formatBytes', () => {
  it('reads as a size limit should', () => {
    expect(formatBytes(512)).toBe('512 B');
    expect(formatBytes(100 * 1024 * 1024)).toBe('100.0 MB');
  });
});
