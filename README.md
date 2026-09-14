# datebud — Date Budget Tracker

Weekend spending, made explicitly dependent on weekday discipline.

Weekdays get a flat daily allowance. Whatever is left of that allowance **becomes** the
weekend budget, and whatever is left at the end of the week rolls into the next one — and
at the end of the month, into the next month. Save on Tuesday and Saturday gets roomier;
overspend on Tuesday and Saturday tightens on its own.

Built from `PRDdatebudgettracker.md`, which is the source of truth for this codebase.
Sections 4 (business rules), 7 (data model) and 8 (API contract) are normative: on any
disagreement between the code and those sections, the PRD wins.

---

## Stack

| Layer | Choice |
|---|---|
| Backend | NestJS 11 (Express), TypeScript |
| ORM / DB | Prisma 6 · MySQL 8.0 (InnoDB, utf8mb4) |
| Frontend | React 19 · Vite 6 · TypeScript, served by Nest in production |
| State | TanStack Query v5 |
| Styling | Tailwind CSS v4, mobile-first · "Periwinkle & Butter" (`requirements/datebud-theme.css`) |
| Type | Fraunces (money) · Public Sans (UI) · IBM Plex Mono (receipts, micro labels) |
| Charts | Recharts (lazy-loaded) |
| Uploads | multer (memory) + sharp |
| Auth | JWT HS256 + rotating refresh cookie + argon2id |
| Dates | date-fns / date-fns-tz, everything in Asia/Jakarta |
| Tests | Jest + supertest (server) · Vitest (client) |

---

## Quick start

### With Docker (recommended)

```bash
cp .env.example .env
# fill in JWT_SECRET (openssl rand -hex 32) and, optionally, the SEED_USER_* trio
docker compose up --build
```

The app comes up on <http://localhost:3000>. Migrations run automatically on start, and if
`SEED_USER_EMAIL` / `SEED_USER_PASSWORD` are set **and the users table is empty**, that
account is created with the seven default categories.

### Local development

```bash
cp .env.example .env          # then fill in JWT_SECRET
docker compose up -d mysql    # or point DATABASE_URL at any MySQL 8
npm install
npm --prefix client install
npx prisma migrate dev
npm run cli -- user:create --email=you@example.com --password=your-password --name=You
npm run dev                   # Nest on :3000, Vite on :5173
```

Open <http://localhost:5173>. The Vite dev server proxies `/api` to Nest.

---

## Scripts

| Command | What it does |
|---|---|
| `npm run dev` | Nest watch + Vite dev server together |
| `npm run build` | Build the client, then the server |
| `npm start` | Run the production build (`dist/main.js`) |
| `npm test` | Server unit tests — no database needed |
| `npm run test:e2e` | Full supertest suite — **needs a running MySQL** |
| `npm --prefix client test` | Client unit tests |
| `npm run cli -- user:create …` | Create a user + their default categories |
| `npm run cli -- categories:recolour` | Move categories off the pre-revamp palette (`--dry-run` first) |
| `npm run backup` | `mysqldump` + receipt storage into one dated tarball |
| `npm run prisma:migrate` | Create/apply a migration in development |
| `npm run migrate:down` | Apply a migration's `down.sql` (see **Migrations** below) |
| `npm run snapshot:before` / `:after` / `:diff` | The migration comparison gate (see **Migrations**) |

API docs are served at `/api/docs` in non-production environments only.

---

## How the calculation works

The engine is a **pure function** — no database, no clock, no side effects — in
`src/modules/reports/engine/compute-month.ts`. Everything else is CRUD and presentation.

```
weekday_count      = Mon–Fri days in the month
dailyWeekdayRate   = FLOOR(monthlyBudget / weekday_count)
roundingRemainder  = monthlyBudget − dailyWeekdayRate × weekday_count

for each week segment w (Mon–Sun, clipped to the month):
  weekBudget[w]    = dailyWeekdayRate × weekdayDays[w]
  rolloverIn[1]    = carryIn + roundingRemainder
  rolloverIn[w>1]  = weekRemaining[w−1]
  weekendBudget[w] = weekBudget[w] − weekdaySpent[w] + rolloverIn[w]
  weekRemaining[w] = weekendBudget[w] − weekendSpent[w]

carryOut = weekRemaining[last]  →  becomes carryIn of the next budgeted month
```

Rules worth knowing before changing anything:

- **Money is always an integer number of rupiah.** No floats anywhere on a money path.
  Division uses `Math.floor` and the remainder is carried, never dropped.
- **Negative is legal.** An expense is never rejected for exceeding a budget; deficits roll
  forward exactly like surpluses. The UI marks them red *and* labels them `OVER` — colour
  is never the only signal. The same rule shapes the category palette: every colour clears
  3:1 on both themes and sits at least ΔE 19 from its neighbours, and the donut still names
  every slice.
- **Carry-in never raises the daily rate.** It enters as `rolloverIn[1]` so the daily
  number stays stable and memorable month to month.
- **Nothing derived is stored.** `carry_out_cached` is a pure optimisation; `NULL` means
  "recompute". Any expense or budget change nulls it for that period *and every later one*.
- **A month without a budget is skipped in the carry-over chain**, so a gap month passes
  the carry-over through to the next budgeted month instead of swallowing it.
- **Every date is Asia/Jakarta.** `spent_on` is a bare `DATE`; "today" comes from
  `ClockService`, never from `new Date()` in domain code.

The invariant `carryOut == monthlyBudget + carryIn − totalSpent` is asserted on **every**
call and property-tested over 1000 random distributions. If it ever fails, the
implementation is wrong.

---

## Project layout

```
src/
  common/            clock, errors, filters, pipes, utils (money, merchant, dates)
  config/            zod env schema — the app refuses to boot if it is not satisfied
  modules/
    auth/            login, refresh rotation, guards, rate limit
    users/           user creation + default category seed
    categories/      CRUD, archive instead of delete
    budgets/         budget CRUD, carry-over resolution, cache invalidation
    wallets/         wallet CRUD, resolution, and the switcher's per-type summaries
    transactions/    CRUD, filters, merchant autocomplete (was `expenses/` in v1.1)
    savings/         goal, deposits, withdrawals, advances, friction preview
    transfers/       two-sided moves between wallets
      engine/        compute-savings.ts · allocate-fifo.ts · delay.ts  ← the savings half
    receipts/        upload, sharp normalisation, storage abstraction
    reports/
      engine/        calendar.ts · compute-month.ts · aggregate.ts  ← the heart
  cli/               user:create
client/src/
  components/        UI primitives and the app shell
  features/          auth · expenses · reports · budget · categories
  lib/               api client, formatting, query keys, WIB date helpers
```

---

## Testing

```bash
npm test                       # 220 unit tests, no database
npm run test:e2e               # 113 HTTP tests against a real MySQL
npm --prefix client test       # formatting and date helpers
```

The unit suite covers T1–T13 from PRD 12.1, including all three golden fixtures, the
1000-case invariant property test, and 24 months of week-segment continuity. It also boots
the whole Nest application against a stubbed database to prove every route in PRD section 8
registers and resolves.

---

## Wallets

From v2 on, an account has many wallets and each wallet's `type` decides which engine
computes its numbers: `DATE_BUDGET` answers "how much may I still spend?", `SAVINGS`
answers "how much do I still have to put in?".

That shape runs through the API. Budgets and reports belong to a wallet:

```
GET  /api/wallets                              # each with the summary its type calls for
PUT  /api/wallets/:walletId/budgets/:period
GET  /api/wallets/:walletId/reports/month/:period
```

Transactions stay at the top level and name their wallet in the body or the query, so
recording a spend does not need one in the URL:

```
POST /api/transactions          { occurredOn, amount, ... }   # default wallet
GET  /api/transactions?walletId=2&kind=WITHDRAW
```

Leaving `walletId` out means the default wallet — the one the migration created, and the
only one that cannot be archived. `kind` must suit the wallet type (a `DEPOSIT` into a
date-budget wallet is a 422), and `direction` is always derived from `kind` by the server.

---

## Savings

A savings wallet has one goal — a target and a deadline — and the engine answers the
opposite question to the date budget: not "how much may I still spend?" but "how much do I
still have to put in?".

```
POST /api/wallets/:walletId/goal              { name, targetAmount, startDate, deadline }
GET  /api/wallets/:walletId/goal              the goal plus every derived figure
POST /api/wallets/:walletId/deposits          { amount, occurredOn, applyToAdvances? }
POST /api/wallets/:walletId/withdrawals       { amount, occurredOn, reason, categoryId }
POST /api/wallets/:walletId/withdrawals/preview   what it costs, in time — writes nothing
GET  /api/wallets/:walletId/advances          what you still owe yourself
```

Three rules are worth knowing because they are deliberate, not incidental:

**A withdrawal cannot be saved without a reason.** Not a soft requirement — `reason` is
required by the request schema, trimmed before it is checked, and the savings kinds are
refused by `POST /api/transactions` precisely so there is no second door around it. The
whole feature exists because money used to leave the account with no record of where it
went.

**A deposit that repays a debt is not progress.** `POST .../deposits` answers with
`{ repaid, fresh }`. A 2.000.000 deposit that settles 600.000 of earlier withdrawals is
1.400.000 of actual progress, and it is `fresh` — never the deposit total — that any pace
figure is compared against.

**`outstandingAdvance` is a memo, not a debit.** It is reported next to the balance and
never subtracted from it: the money already left, and the balance already shows that.

Unlike the date budget, a savings balance may not go negative — a budget is a plan, a
balance is a fact about an account.

---

## Transfers

Moving money between wallets is one action that writes two rows — a `TRANSFER_OUT` in the
source and a `TRANSFER_IN` in the destination, sharing a `transferGroupId`:

```
POST   /api/transfers            { fromWalletId, toWalletId, amount, occurredOn }
PATCH  /api/transfers/:groupId   amount, date or note, on both sides at once
DELETE /api/transfers/:groupId   both sides, together
```

They are addressed by the group, never by row: `DELETE /api/transactions/:id` on one side
answers 409 and points here. A half-deleted transfer is money that left one wallet and
arrived nowhere, and nothing in the reports would flag it.

**A transfer lands in the week its date falls in** — not in week 1, and not through the
carry-over. Moving 320.000 to savings on the 3rd makes *that* weekend poorer, where the
tradeoff is still a decision rather than a surprise at the end of the month:

```
Budget minggu ini (5 × 100rb)      Rp 500.000
Terpakai di weekday              − Rp  93.000
Dipindah ke Tabungan             − Rp 320.000
```

Where a transfer sits cannot change `carryOut`, only which week feels it. That falls out of
the amended invariant the engine asserts on every call:

```
carryOut == monthlyBudget + carryIn − totalSpent − transferOut + transferIn
```

Transfers carry no category and appear in no category, merchant or payment-method
breakdown.

---

## Migrations

Money data is the whole point of this app, so schema changes carry two things a plain
`prisma migrate` does not.

**A down migration.** Prisma has no native rollback, so any migration that is not a
straightforward add-a-column ships a `down.sql` next to its `migration.sql`, applied with:

```bash
npm run backup                 # always first
npm run migrate:down           # the newest migration
npm run migrate:down 20260914120000_wallets_and_transactions
```

A `down.sql` refuses rather than destroys: if rolling back would drop rows the older schema
cannot represent, it aborts before touching anything and names what is in the way.

**A before/after comparison.** The v2 migration renames `expenses` to `transactions`, and
the gate on it is that every month's report comes back byte-identical:

```bash
npm run snapshot:before        # old code, pre-migration database
# ... apply the migration, deploy the new code ...
npm run snapshot:after
npm run snapshot:diff          # exits non-zero on any difference
```

Both snapshots must be taken on the same WIB day — the report includes `daysElapsed` and
`isCurrent`, and `snapshot:diff` refuses to compare across a date boundary rather than
blanking those fields. If the diff fails, the migration is wrong; fix the migration rather
than compensating in the application layer.

---

## Security notes

- Every endpoint except login, refresh and health requires a bearer token, and **every
  query is scoped by `user_id`**.
- Refresh tokens are stored only as SHA-256 digests, rotated on every use, and revoked
  wholesale when the password changes. The cookie is httpOnly and scoped to `/api/auth`.
- The access token lives in memory on the client only — never in `localStorage`.
- Uploads are validated by **magic bytes**, not the `Content-Type` header, then re-encoded
  to WebP with EXIF (including GPS) stripped. The original filename is never used as a path.
- Receipt images are streamed through an authenticated, ownership-checked endpoint. They are
  never exposed via static middleware.
- Login is rate limited to 5 attempts per 15 minutes per IP.

---

## Not in v1

Multi-user or shared budgets, public sign-up, national holiday handling (red dates are
ordinary weekdays), bank/e-wallet integration, receipt OCR, non-date budget categories,
multi-currency, push reminders, and PDF/Excel export. Offline **reads** work; offline
writes are deliberately out of scope — a queued expense replayed later would corrupt the
carry-over chain invisibly.

See PRD section 14 for the full v1.1 backlog.
