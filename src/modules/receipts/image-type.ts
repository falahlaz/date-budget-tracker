/**
 * Image type detection from magic bytes (PRD 8.5).
 *
 * The Content-Type header is attacker-controlled, so it is never trusted on its own: a
 * .exe renamed to .jpg with an image/jpeg header would sail straight past a header check.
 */

export const ACCEPTED_MIME_TYPES = [
  'image/jpeg',
  'image/png',
  'image/webp',
  'image/heic',
  'image/heif',
] as const;

export type AcceptedMimeType = (typeof ACCEPTED_MIME_TYPES)[number];

const HEIF_BRANDS = new Set([
  'heic',
  'heix',
  'hevc',
  'hevx',
  'heim',
  'heis',
  'hevm',
  'hevs',
  'mif1',
  'msf1',
]);

function startsWith(buffer: Buffer, bytes: number[], offset = 0): boolean {
  if (buffer.length < offset + bytes.length) return false;
  return bytes.every((byte, index) => buffer[offset + index] === byte);
}

/** Returns the real image type of a buffer, or null when it is not an accepted image. */
export function detectImageType(buffer: Buffer): AcceptedMimeType | null {
  // JPEG: FF D8 FF
  if (startsWith(buffer, [0xff, 0xd8, 0xff])) return 'image/jpeg';

  // PNG: 89 50 4E 47 0D 0A 1A 0A
  if (startsWith(buffer, [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a])) return 'image/png';

  // WebP: "RIFF" .... "WEBP"
  if (startsWith(buffer, [0x52, 0x49, 0x46, 0x46]) && startsWith(buffer, [0x57, 0x45, 0x42, 0x50], 8)) {
    return 'image/webp';
  }

  // HEIF/HEIC: ISO-BMFF box with "ftyp" at offset 4 and a HEIF brand at offset 8.
  if (buffer.length >= 12 && buffer.toString('latin1', 4, 8) === 'ftyp') {
    const brand = buffer.toString('latin1', 8, 12);
    if (HEIF_BRANDS.has(brand)) {
      return brand.startsWith('hev') || brand === 'heic' || brand === 'heix' ? 'image/heic' : 'image/heif';
    }
  }

  return null;
}
