import { Readable } from 'node:stream';

/**
 * Storage abstraction (PRD 10.4).
 *
 * Domain code only ever sees this interface, so swapping local disk for S3 later means
 * adding one class and changing one provider -- no service or controller changes.
 */
export interface StorageService {
  save(key: string, buffer: Buffer, mimeType: string): Promise<void>;
  read(key: string): Promise<Readable>;
  delete(key: string): Promise<void>;
  exists(key: string): Promise<boolean>;
}

export const STORAGE_SERVICE = Symbol('STORAGE_SERVICE');
