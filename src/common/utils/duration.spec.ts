import { parseDurationSeconds } from './duration';

describe('parseDurationSeconds', () => {
  it('converts each supported unit', () => {
    expect(parseDurationSeconds('45s')).toBe(45);
    expect(parseDurationSeconds('15m')).toBe(900);
    expect(parseDurationSeconds('2h')).toBe(7200);
    expect(parseDurationSeconds('30d')).toBe(2_592_000);
  });

  it('tolerates surrounding whitespace and uppercase units', () => {
    expect(parseDurationSeconds(' 15M ')).toBe(900);
  });

  it('rejects anything it cannot parse', () => {
    expect(() => parseDurationSeconds('15 minutes')).toThrow(TypeError);
    expect(() => parseDurationSeconds('')).toThrow(TypeError);
    expect(() => parseDurationSeconds('-5m')).toThrow(TypeError);
  });
});
