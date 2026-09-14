/**
 * The M10 go/no-go gate (PRD v2 section 9.1, test M1).
 *
 * Captures `GET .../reports/month/:period` for every month that has data, before and
 * after the migration, and refuses to pass unless the two sets are identical. The PRD is
 * blunt about this: if the numbers move, the migration is wrong, and it is not to be
 * patched over in the application layer.
 *
 * Deliberately goes through real HTTP against a running server rather than calling the
 * service directly. "The endpoint returns the same thing" is the claim being tested, and
 * only the endpoint can make it.
 *
 *   npm run snapshot:before     # v1.1 code, pre-migration database
 *   npm run snapshot:after      # v2 code, migrated database
 *   npm run snapshot:diff
 *
 * The report carries `daysElapsed` and `isCurrent`, which follow the WIB calendar. Rather
 * than blanking those fields -- which would quietly stop testing them -- each run records
 * the WIB date it ran on, and the diff refuses to compare runs from different days.
 */

import { createHash } from 'node:crypto';
import { existsSync, mkdirSync, readFileSync, readdirSync, rmSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';

/**
 * Reads `.env` for the credentials, without pulling in dotenv for one script. Anything
 * already exported wins, so CI can override without editing the file.
 */
function loadDotEnv(path = '.env'): void {
  if (!existsSync(path)) return;

  for (const line of readFileSync(path, 'utf8').split('\n')) {
    const match = /^\s*([A-Z0-9_]+)\s*=\s*(.*)$/.exec(line);
    if (!match) continue;

    const [, key, rawValue] = match;
    if (process.env[key] !== undefined) continue;

    process.env[key] = rawValue.trim().replace(/^["'](.*)["']$/, '$1');
  }
}

loadDotEnv();

const BASE_URL = process.env.SNAPSHOT_BASE_URL ?? 'http://localhost:3000';
const ROOT = process.env.SNAPSHOT_DIR ?? 'snapshots';
const EMAIL = process.env.SEED_USER_EMAIL;
const PASSWORD = process.env.SEED_USER_PASSWORD;

interface Manifest {
  /** The WIB date the snapshot was taken on. */
  takenOn: string;
  /** Which endpoint shape answered -- informational, the payload is what is compared. */
  reportPath: string;
  periods: string[];
}

function wibToday(): string {
  return new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Asia/Jakarta',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(new Date());
}

/** Stable JSON: object keys sorted at every depth, so a diff is about values only. */
function canonical(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(canonical);
  if (value && typeof value === 'object') {
    return Object.fromEntries(
      Object.keys(value as Record<string, unknown>)
        .sort()
        .map((key) => [key, canonical((value as Record<string, unknown>)[key])]),
    );
  }
  return value;
}

async function api<T>(path: string, token?: string, init?: RequestInit): Promise<T> {
  const response = await fetch(`${BASE_URL}${path}`, {
    ...init,
    headers: {
      'content-type': 'application/json',
      ...(token ? { authorization: `Bearer ${token}` } : {}),
      ...(init?.headers ?? {}),
    },
  });

  if (!response.ok) {
    throw new Error(`${init?.method ?? 'GET'} ${path} -> ${response.status} ${await response.text()}`);
  }

  return (await response.json()) as T;
}

async function login(): Promise<string> {
  if (!EMAIL || !PASSWORD) {
    throw new Error('SEED_USER_EMAIL and SEED_USER_PASSWORD must be set (they are in .env)');
  }

  const body = await api<{ accessToken: string }>('/api/auth/login', undefined, {
    method: 'POST',
    body: JSON.stringify({ email: EMAIL, password: PASSWORD }),
  });

  return body.accessToken;
}

/**
 * Where the month report lives.
 *
 * M10 leaves the v1.1 paths alone; M12 moves them under a wallet. Probing rather than
 * taking a flag means the same script captures both sides of either migration.
 */
async function resolveWallet(token: string): Promise<{
  walletId: number | null;
  reportPath: (period: string) => string;
}> {
  try {
    const wallets = await api<{ id: number; isDefault: boolean; type: string }[]>(
      '/api/wallets',
      token,
    );
    const dateBudget = wallets.filter((wallet) => wallet.type === 'DATE_BUDGET');
    const chosen = dateBudget.find((wallet) => wallet.isDefault) ?? dateBudget[0];

    if (chosen) {
      return {
        walletId: chosen.id,
        reportPath: (period) => `/api/wallets/${chosen.id}/reports/month/${period}`,
      };
    }
  } catch {
    // No /api/wallets yet -- this is a pre-M12 server.
  }

  return { walletId: null, reportPath: (period) => `/api/reports/month/${period}` };
}

/** The list endpoints cap `limit` at 200, so every collection here has to page. */
const PAGE_SIZE = 200;

/**
 * Every month worth comparing: the budgeted ones, plus any month that only has spending
 * in it (PRD v1.1 6.5 keeps those out of the carry chain but still reports them).
 *
 * Paging is not a detail to skip. Stopping at one page would quietly drop the oldest
 * months from the comparison and let M1 "pass" without having looked at them.
 */
async function collectPeriods(token: string, walletId: number | null): Promise<string[]> {
  const periods = new Set<string>();

  // Budgets moved under their wallet in M12; before that they were top-level.
  const budgetsPath = walletId === null ? '/api/budgets' : `/api/wallets/${walletId}/budgets`;

  for await (const budget of pages<{ period: string }>(token, budgetsPath)) {
    periods.add(budget.period);
  }

  // `transactions` from M12 onward, `expenses` before it; exactly one of them answers.
  const listPath = await firstWorkingPath(token, ['/api/transactions', '/api/expenses']);

  for await (const row of pages<Record<string, string>>(token, listPath)) {
    const date = row.occurredOn ?? row.spentOn;
    if (date) periods.add(date.slice(0, 7));
  }

  return [...periods].sort();
}

async function firstWorkingPath(token: string, candidates: string[]): Promise<string> {
  for (const candidate of candidates) {
    try {
      await api<unknown>(`${candidate}?limit=1`, token);
      return candidate;
    } catch {
      // Try the next spelling.
    }
  }

  throw new Error(`none of these list endpoints answered: ${candidates.join(', ')}`);
}

/** Walks a `{ items, total }` endpoint to the end. */
async function* pages<T>(token: string, path: string): AsyncGenerator<T> {
  const separator = path.includes('?') ? '&' : '?';

  for (let offset = 0; ; offset += PAGE_SIZE) {
    const page = await api<{ items: T[]; total: number }>(
      `${path}${separator}limit=${PAGE_SIZE}&offset=${offset}`,
      token,
    );

    for (const item of page.items) yield item;

    // Trust the row count rather than `total`, so a short page always terminates.
    if (page.items.length < PAGE_SIZE) return;
  }
}

async function capture(label: 'before' | 'after'): Promise<void> {
  const dir = join(ROOT, label);

  // Cleared FIRST, before anything that can fail. Leaving the previous run's files in
  // place would let `snapshot:diff` compare an old capture against a fresh one and report
  // a pass -- which is exactly what a migration gate must never do.
  rmSync(dir, { recursive: true, force: true });

  const token = await login();
  const { walletId, reportPath } = await resolveWallet(token);
  const periods = await collectPeriods(token, walletId);

  if (periods.length === 0) {
    throw new Error('no periods with data found -- nothing to compare, refusing to write an empty snapshot');
  }

  mkdirSync(dir, { recursive: true });

  for (const period of periods) {
    const report = await api<unknown>(reportPath(period), token);
    writeFileSync(join(dir, `${period}.json`), `${JSON.stringify(canonical(report), null, 2)}\n`);
  }

  const manifest: Manifest = { takenOn: wibToday(), reportPath: reportPath(':period'), periods };
  writeFileSync(join(dir, 'manifest.json'), `${JSON.stringify(manifest, null, 2)}\n`);

  console.log(`[snapshot:${label}] ${periods.length} period(s) -> ${dir}`);
  console.log(`[snapshot:${label}] ${periods.join(', ')}`);
  console.log(`[snapshot:${label}] taken on ${manifest.takenOn} WIB via ${manifest.reportPath}`);
}

function readManifest(label: string): Manifest {
  try {
    return JSON.parse(readFileSync(join(ROOT, label, 'manifest.json'), 'utf8')) as Manifest;
  } catch {
    console.error(
      `[snapshot:diff] no "${label}" snapshot. Run \`npm run snapshot:${label}\` first --\n` +
        '  and if it failed, fix that rather than diffing what is left over.',
    );
    process.exit(1);
  }
}

function digest(label: string, period: string): string {
  return createHash('sha256')
    .update(readFileSync(join(ROOT, label, `${period}.json`)))
    .digest('hex');
}

function diff(): void {
  const before = readManifest('before');
  const after = readManifest('after');

  if (before.takenOn !== after.takenOn) {
    console.error(
      `[snapshot:diff] REFUSING: before was taken on ${before.takenOn} WIB and after on ${after.takenOn}.\n` +
        '  The report includes daysElapsed and isCurrent, which move with the calendar, so a\n' +
        '  cross-day comparison would report differences the migration did not cause.\n' +
        '  Re-take both snapshots on the same WIB day.',
    );
    process.exit(1);
  }

  const periods = [...new Set([...before.periods, ...after.periods])].sort();
  const failures: string[] = [];

  for (const period of periods) {
    const inBefore = before.periods.includes(period);
    const inAfter = after.periods.includes(period);

    if (!inBefore || !inAfter) {
      failures.push(`${period}: present ${inBefore ? 'only before' : 'only after'} the migration`);
      continue;
    }

    if (digest('before', period) !== digest('after', period)) {
      failures.push(`${period}: report differs`);
    }
  }

  if (failures.length > 0) {
    console.error(`[snapshot:diff] M1 FAILED -- ${failures.length} problem(s):`);
    failures.forEach((failure) => console.error(`  - ${failure}`));
    console.error('\n  Diff a period with:');
    console.error(`    diff ${join(ROOT, 'before')}/<period>.json ${join(ROOT, 'after')}/<period>.json`);
    console.error('\n  Per PRD v2 section 13: fix the migration. Do not compensate in the app layer.');
    process.exit(1);
  }

  console.log(`[snapshot:diff] M1 PASSED -- ${periods.length} period(s) identical: ${periods.join(', ')}`);
}

function listSnapshots(): void {
  for (const label of ['before', 'after']) {
    try {
      const files = readdirSync(join(ROOT, label));
      console.log(`${label}: ${files.length} file(s)`);
    } catch {
      console.log(`${label}: not captured`);
    }
  }
}

async function main(): Promise<void> {
  const mode = process.argv[2];

  switch (mode) {
    case 'before':
    case 'after':
      await capture(mode);
      break;
    case 'diff':
      diff();
      break;
    case 'list':
      listSnapshots();
      break;
    default:
      console.error('usage: report-snapshot.ts <before|after|diff|list>');
      process.exit(2);
  }
}

main().catch((error: unknown) => {
  console.error(`[snapshot] ${error instanceof Error ? error.message : String(error)}`);
  process.exit(1);
});
