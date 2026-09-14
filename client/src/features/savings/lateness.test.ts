import { describe, expect, it } from 'vitest';
import { latenessLabel, projectionSentence } from './lateness';

describe('latenessLabel', () => {
  it('counts in days while it is under a month', () => {
    expect(latenessLabel(13)).toBe('telat 13 hari');
    expect(latenessLabel(30)).toBe('telat 30 hari');
  });

  it('switches to months past that', () => {
    expect(latenessLabel(31)).toBe('telat 1 bulan');
    // Fixture D: projected 2028-05-18 against a 2027-08-31 deadline.
    expect(latenessLabel(261)).toBe('telat 9 bulan');
  });

  it('says nothing at all when the projection is not late', () => {
    expect(latenessLabel(0)).toBeNull();
    expect(latenessLabel(-40)).toBeNull();
    expect(latenessLabel(null)).toBeNull();
  });
});

describe('projectionSentence', () => {
  const month = (period: string) => `bulan ${period}`;

  it('names the month and how late it lands', () => {
    expect(
      projectionSentence(
        { projectedDate: '2028-05-18', projectedDaysLate: 261, projectionNote: null },
        month,
      ),
    ).toBe('Dengan laju 3 bulan terakhir, target kekejar bulan 2028-05 — telat 9 bulan dari tenggat.');
  });

  it('drops the lateness clause when the projection beats the deadline', () => {
    expect(
      projectionSentence(
        { projectedDate: '2027-06-01', projectedDaysLate: -90, projectionNote: null },
        month,
      ),
    ).toContain('masih on track');
  });

  /**
   * Section 8.2: a flat or falling three months has no honest projection, and the server
   * says so by sending a null date with a sentence. Printing "kekejar Invalid Date" is the
   * failure this guards.
   */
  it('prints the server sentence when there is no projection', () => {
    expect(
      projectionSentence(
        {
          projectedDate: null,
          projectedDaysLate: null,
          projectionNote: 'Tabungan lo lagi ga nambah, jadi belum bisa diproyeksiin.',
        },
        month,
      ),
    ).toBe('Tabungan lo lagi ga nambah, jadi belum bisa diproyeksiin.');
  });
});
