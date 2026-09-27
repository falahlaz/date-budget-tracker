import { cleanName, cleanReference, findDate, monthFromName, parseRupiahDigits } from './common';

describe('parseRupiahDigits', () => {
  it.each([
    ['123.000', 123_000],
    ['25.000,00', 25_000],
    ['35.520', 35_520],
    ['1.250.000', 1_250_000],
    ['25,000.00', 25_000],
    ['123.O00', 123_000],
    ['5O.OOO', 50_000],
    ['15.000.', 15_000],
  ])('reads %s as %d', (raw, expected) => {
    expect(parseRupiahDigits(raw)).toBe(expected);
  });

  it('rejects zero, garbage and amounts beyond the INT column', () => {
    expect(parseRupiahDigits('0')).toBeNull();
    expect(parseRupiahDigits('1x2')).toBeNull();
    expect(parseRupiahDigits('99.999.999.999')).toBeNull();
  });
});

describe('findDate', () => {
  it.each([
    ['15/09/2026 17:56:04', '2026-09-15'],
    ['Tanggal 26 Sep 2026', '2026-09-26'],
    ['11 September 2026, 10.27', '2026-09-11'],
    ['Tanggal 26 5ep 2026', '2026-09-26'],
    ['3 Agu 2026', '2026-08-03'],
    ['1 Mei 2026', '2026-05-01'],
    ['9 Des 2025', '2025-12-09'],
  ])('reads %s', (text, expected) => {
    expect(findDate(text)).toBe(expected);
  });

  it('skips impossible dates and non-month words', () => {
    expect(findDate('31/02/2026')).toBeNull();
    expect(findDate('Jalan Radin Inten 2 Duren 2026')).toBeNull();
    expect(findDate('nothing here')).toBeNull();
  });
});

describe('monthFromName', () => {
  it('accepts Indonesian and English names, full or abbreviated', () => {
    expect(monthFromName('Oktober')).toBe(10);
    expect(monthFromName('Oct')).toBe(10);
    expect(monthFromName('Agustus')).toBe(8);
    expect(monthFromName('Waktu')).toBeNull();
  });
});

describe('cleanName', () => {
  it('strips icon debris and truncation from the edges', () => {
    expect(cleanName('Google One =')).toBe('Google One');
    expect(cleanName('Google One -')).toBe('Google One');
    expect(cleanName('Semangkuk Asap Duren...')).toBe('Semangkuk Asap Duren');
    expect(cleanName('EVIRA FEBRIANI')).toBe('EVIRA FEBRIANI');
  });

  it('returns null for lines that are not names', () => {
    expect(cleanName('—')).toBeNull();
    expect(cleanName('\\ J')).toBeNull();
    expect(cleanName(undefined)).toBeNull();
  });

  it('keeps names within the merchant column', () => {
    expect(cleanName('A'.repeat(200))).toHaveLength(120);
  });
});

describe('cleanReference', () => {
  it('keeps a full reference and drops a truncated one', () => {
    expect(cleanReference('198035216')).toBe('198035216');
    expect(cleanReference('0420260926031623F..."@')).toBeNull();
    expect(cleanReference(null)).toBeNull();
  });
});
