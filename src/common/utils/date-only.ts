/**
 * Conversion between the `YYYY-MM-DD` strings the engine works in and the `Date` objects
 * Prisma uses for a MySQL `DATE` column.
 *
 * A MySQL DATE has no time and no zone. Prisma represents it as a Date at UTC midnight,
 * so both directions here pin to UTC deliberately: doing this in local time would shift
 * `spent_on` by a day for any server west of Greenwich (PRD 7.1).
 */

export function toDateOnly(date: string): Date {
  return new Date(`${date}T00:00:00.000Z`);
}

export function fromDateOnly(date: Date): string {
  return date.toISOString().slice(0, 10);
}
