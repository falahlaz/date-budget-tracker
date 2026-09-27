import { MONEY_MAX } from '@/common/utils/money';

/**
 * Helpers shared by the per-provider receipt parsers.
 *
 * Everything here works on raw OCR output, so it has to tolerate the mistakes Tesseract
 * reliably makes on phone screenshots: a letter O read into a number, stray symbols where
 * an icon sat, a label and its value merged onto one line.
 */

/** Merchant names are stored in a VARCHAR(120). */
const MERCHANT_MAX = 120;

/** Non-empty, whitespace-collapsed lines of OCR text. */
export function toLines(text: string): string[] {
  return text
    .split(/\r?\n/)
    .map((line) => line.replace(/\s+/g, ' ').trim())
    .filter((line) => line !== '');
}

/** A rupiah figure as printed ("Rp123.000", "Rp 25.000,00", "-Rp35.520"), anywhere in a line. */
const RUPIAH_PATTERN = /R[pP]\s?\.?\s?([0-9OoIl][0-9OoIl.,]*)/;

/**
 * Parses the digits after "Rp" into whole rupiah.
 *
 * Indonesian apps write thousands with dots and cents with a comma, but a receipt in
 * English locale swaps them; either way, a separator followed by exactly two trailing
 * digits is the cents part and is dropped (amounts are whole rupiah everywhere).
 */
export function parseRupiahDigits(raw: string): number | null {
  const digits = raw
    .replace(/[Oo]/g, '0')
    .replace(/[Il]/g, '1')
    .replace(/[.,]+$/, '')
    .replace(/[.,]\d{2}$/, '')
    .replace(/[.,]/g, '');

  if (!/^\d+$/.test(digits)) return null;

  const value = Number(digits);
  return value >= 1 && value <= MONEY_MAX ? value : null;
}

/** The first rupiah amount in a line, or null. */
export function amountInLine(line: string): number | null {
  const match = RUPIAH_PATTERN.exec(line);
  return match ? parseRupiahDigits(match[1]) : null;
}

/** Index of the first line carrying a rupiah amount, or -1. */
export function findAmountLine(lines: string[]): number {
  return lines.findIndex((line) => amountInLine(line) !== null);
}

const MONTHS: Record<string, number> = {
  jan: 1,
  feb: 2,
  mar: 3,
  apr: 4,
  mei: 5,
  may: 5,
  jun: 6,
  jul: 7,
  agu: 8,
  agt: 8,
  ags: 8,
  aug: 8,
  sep: 9,
  okt: 10,
  oct: 10,
  nov: 11,
  des: 12,
  dec: 12,
};

/** Month number from a (possibly abbreviated, possibly misread) month name. */
export function monthFromName(name: string): number | null {
  // Tesseract reads a capital S as 5 and an O as 0 often enough to be worth undoing.
  const normalized = name.toLowerCase().replace(/^5/, 's').replace(/^0/, 'o').slice(0, 3);
  return MONTHS[normalized] ?? null;
}

/** YYYY-MM-DD for a real calendar date, or null for something like 31 Feb. */
export function toIsoDate(year: number, month: number, day: number): string | null {
  const date = new Date(Date.UTC(year, month - 1, day));
  if (
    date.getUTCFullYear() !== year ||
    date.getUTCMonth() !== month - 1 ||
    date.getUTCDate() !== day
  ) {
    return null;
  }
  return `${year}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
}

/**
 * The first date in the text, as YYYY-MM-DD.
 *
 * Understands "15/09/2026" (day first, as every Indonesian bank prints it), "26 Sep 2026"
 * and "11 September 2026".
 */
export function findDate(text: string): string | null {
  const numeric = /(\d{1,2})[/-](\d{1,2})[/-](\d{4})/.exec(text);
  if (numeric) {
    const iso = toIsoDate(Number(numeric[3]), Number(numeric[2]), Number(numeric[1]));
    if (iso) return iso;
  }

  const named = /(\d{1,2})\s+([A-Za-z5][A-Za-z]{2,8})\.?,?\s+(\d{4})/g;
  for (const match of text.matchAll(named)) {
    const month = monthFromName(match[2]);
    if (month === null) continue;
    const iso = toIsoDate(Number(match[3]), month, Number(match[1]));
    if (iso) return iso;
  }

  return null;
}

/**
 * Tidies a merchant or recipient name read off a receipt.
 *
 * Strips the icon debris OCR leaves at the edges ("Google One =", "Jago @") and the
 * ellipsis an app adds when it truncates a long name. Returns null when what is left does
 * not look like a name at all.
 */
export function cleanName(raw: string | undefined | null): string | null {
  if (!raw) return null;

  const cleaned = raw
    .replace(/(\.{2,}|…).*$/, '')
    .replace(/^[^\p{L}\p{N}]+/u, '')
    .replace(/(\s+[^\p{L}\p{N}\s]{1,3})+$/u, '')
    .replace(/[^\p{L}\p{N})]+$/u, '')
    .trim();

  const letters = cleaned.match(/\p{L}/gu)?.length ?? 0;
  if (letters < 2) return null;

  return cleaned.slice(0, MERCHANT_MAX).trim();
}

/**
 * The value printed after a label on the same line ("Tanggal 26 Sep 2026"), matching the
 * label case-insensitively and allowing a couple of misread letters to still count.
 */
export function valueAfterLabel(lines: string[], label: RegExp): string | null {
  for (const line of lines) {
    const match = label.exec(line);
    if (match) {
      const value = line.slice(match.index + match[0].length).replace(/^[\s:]+/, '');
      if (value !== '') return value;
    }
  }
  return null;
}

/** A transaction reference: an unbroken run of letters and digits, never a truncated one. */
export function cleanReference(raw: string | null): string | null {
  if (!raw) return null;
  // A reference the app cut short with "..." is useless for matching, so it is dropped
  // rather than half-copied into the note.
  if (/\.{2,}|…/.test(raw)) return null;

  const match = /[A-Za-z0-9]{6,}/.exec(raw);
  return match ? match[0] : null;
}
