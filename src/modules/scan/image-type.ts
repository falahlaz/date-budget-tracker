/**
 * Image type detection from magic bytes.
 *
 * The Content-Type header is attacker-controlled, so it is never trusted on its own: a
 * .exe renamed to .jpg with an image/jpeg header would sail straight past a header check.
 * Only the formats a phone screenshot or share sheet actually produces are accepted.
 */

export type ScannableImageType = 'image/jpeg' | 'image/png' | 'image/webp';

function startsWith(buffer: Buffer, bytes: number[], offset = 0): boolean {
  if (buffer.length < offset + bytes.length) return false;
  return bytes.every((byte, index) => buffer[offset + index] === byte);
}

/** Returns the real image type of a buffer, or null when it is not an accepted image. */
export function detectImageType(buffer: Buffer): ScannableImageType | null {
  // JPEG: FF D8 FF
  if (startsWith(buffer, [0xff, 0xd8, 0xff])) return 'image/jpeg';

  // PNG: 89 50 4E 47 0D 0A 1A 0A
  if (startsWith(buffer, [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a])) return 'image/png';

  // WebP: "RIFF" .... "WEBP"
  if (
    startsWith(buffer, [0x52, 0x49, 0x46, 0x46]) &&
    startsWith(buffer, [0x57, 0x45, 0x42, 0x50], 8)
  ) {
    return 'image/webp';
  }

  return null;
}
