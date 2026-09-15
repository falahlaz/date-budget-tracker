import { detectImageType } from './image-type';

function bytes(...values: number[]): Buffer {
  return Buffer.from(values);
}

function padded(buffer: Buffer, length = 32): Buffer {
  return Buffer.concat([buffer, Buffer.alloc(Math.max(0, length - buffer.length))]);
}

describe('detectImageType', () => {
  it('recognises JPEG, PNG and WebP by magic bytes', () => {
    expect(detectImageType(padded(bytes(0xff, 0xd8, 0xff, 0xe0)))).toBe('image/jpeg');
    expect(detectImageType(padded(bytes(0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a)))).toBe(
      'image/png',
    );

    const webp = Buffer.concat([Buffer.from('RIFF'), Buffer.alloc(4), Buffer.from('WEBP')]);
    expect(detectImageType(padded(webp))).toBe('image/webp');
  });

  it('recognises HEIC and HEIF brands', () => {
    const heic = Buffer.concat([Buffer.alloc(4), Buffer.from('ftyp'), Buffer.from('heic')]);
    expect(detectImageType(padded(heic))).toBe('image/heic');

    const mif1 = Buffer.concat([Buffer.alloc(4), Buffer.from('ftyp'), Buffer.from('mif1')]);
    expect(detectImageType(padded(mif1))).toBe('image/heif');
  });

  it('rejects a PDF even when it claims to be an image', () => {
    expect(detectImageType(padded(Buffer.from('%PDF-1.7')))).toBeNull();
  });

  it('rejects an executable and other non-images', () => {
    expect(detectImageType(padded(bytes(0x4d, 0x5a)))).toBeNull(); // MZ
    expect(detectImageType(padded(bytes(0x7f, 0x45, 0x4c, 0x46)))).toBeNull(); // ELF
    expect(detectImageType(Buffer.alloc(0))).toBeNull();
    expect(detectImageType(bytes(0xff))).toBeNull();
  });

  it('rejects an mp4, which shares the ftyp box but is not a still image', () => {
    const mp4 = Buffer.concat([Buffer.alloc(4), Buffer.from('ftyp'), Buffer.from('isom')]);
    expect(detectImageType(padded(mp4))).toBeNull();
  });
});
