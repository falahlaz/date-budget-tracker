import { normalizeMerchant } from './merchant';

describe('normalizeMerchant (PRD 7.3)', () => {
  // T11
  it('folds every spelling of the same place onto one key', () => {
    expect(normalizeMerchant('Bakmi GM')).toBe('bakmigm');
    expect(normalizeMerchant(' bakmi  gm ')).toBe('bakmigm');
    expect(normalizeMerchant('Bakmi G.M.')).toBe('bakmigm');
    expect(normalizeMerchant('BAKMI GM!')).toBe('bakmigm');
    expect(normalizeMerchant('Bakmi-GM')).toBe('bakmigm');
  });

  it('strips diacritics so accented and plain spellings match', () => {
    expect(normalizeMerchant('Café Batavia')).toBe('cafebatavia');
    expect(normalizeMerchant('Cafe Batavia')).toBe('cafebatavia');
  });

  // T12
  it('returns null for anything that normalises to an empty key', () => {
    expect(normalizeMerchant('')).toBeNull();
    expect(normalizeMerchant('   ')).toBeNull();
    expect(normalizeMerchant('!!!')).toBeNull();
    expect(normalizeMerchant('🍜')).toBeNull();
    expect(normalizeMerchant(null)).toBeNull();
    expect(normalizeMerchant(undefined)).toBeNull();
  });

  it('keeps digits, which are part of many place names', () => {
    expect(normalizeMerchant('Kopi Kenangan 88')).toBe('kopikenangan88');
  });

  it('keeps word order significant so different places do not collide', () => {
    expect(normalizeMerchant('Kopi Janji')).not.toBe(normalizeMerchant('Janji Kopi'));
  });

  it('is idempotent -- normalising a key again yields the same key', () => {
    const key = normalizeMerchant('Bakmi G.M.');
    expect(normalizeMerchant(key)).toBe(key);
  });
});
