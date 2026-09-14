import { INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import cookieParser from 'cookie-parser';
import request from 'supertest';
import { AppModule } from '@/app.module';
import { AllExceptionsFilter } from '@/common/filters/all-exceptions.filter';
import { buildValidationPipe } from '@/common/pipes/validation.pipe';
import { PrismaService } from '@/prisma/prisma.service';
import { UsersService } from '@/modules/users/users.service';
import { ClockService } from '@/common/clock/clock.service';

export interface Harness {
  app: INestApplication;
  prisma: PrismaService;
  /** Authorization header value for the seeded user. */
  auth: string;
  userId: number;
  http: () => request.Agent;
  close: () => Promise<void>;
}

/**
 * A ClockService pinned to one date.
 *
 * The PRD's fixtures are tied to the calendar shape of a specific month -- Fixture B only
 * splits into five week segments because of how September 2026 falls -- so those dates
 * cannot drift with the wall clock. But they are also rejected outright once they sit in
 * the future (PRD 6.9). Pinning the clock is the only way to have both: the fixture keeps
 * its calendar, and the future-date rule stays switched on rather than being worked around.
 */
class FixedClock {
  constructor(private readonly fixed: string) {}

  get timeZone(): string {
    return 'Asia/Jakarta';
  }

  now(): Date {
    return new Date(`${this.fixed}T12:00:00+07:00`);
  }

  today(): string {
    return this.fixed;
  }

  currentPeriod(): string {
    return this.fixed.slice(0, 7);
  }
}

export const TEST_USER = {
  email: 'e2e@datebud.test',
  password: 'e2e-password-123',
  displayName: 'E2E',
};

/**
 * Boots the real application against the real database.
 *
 * Deliberately not a mocked stack: the behaviours under test here -- soft deletes leaving
 * reports, carry-over invalidation across months, ownership checks on file streams -- only
 * mean anything against actual SQL.
 */
export async function createHarness(
  options: { login?: boolean; today?: string } = {},
): Promise<Harness> {
  const builder = Test.createTestingModule({ imports: [AppModule] });

  if (options.today) {
    builder.overrideProvider(ClockService).useValue(new FixedClock(options.today));
  }

  const moduleRef = await builder.compile();

  const app = moduleRef.createNestApplication();
  app.use(cookieParser());
  app.setGlobalPrefix('api');
  app.useGlobalPipes(buildValidationPipe());
  app.useGlobalFilters(new AllExceptionsFilter());
  await app.init();

  const prisma = app.get(PrismaService);
  await resetDatabase(prisma);

  const users = app.get(UsersService);
  const user = await users.createUser(TEST_USER);

  let auth = '';
  if (options.login !== false) {
    const response = await request(app.getHttpServer())
      .post('/api/auth/login')
      .send({ email: TEST_USER.email, password: TEST_USER.password })
      .expect(200);

    auth = `Bearer ${response.body.accessToken}`;
  }

  return {
    app,
    prisma,
    auth,
    userId: user.id,
    http: () => request(app.getHttpServer()),
    close: async () => {
      await resetDatabase(prisma);
      await app.close();
    },
  };
}

/**
 * Wipes every table in dependency order.
 *
 * The order is the foreign keys read backwards, and two of them bite: allocations point at
 * transactions with ON DELETE RESTRICT, so they have to go first, and transactions point at
 * wallets, so wallets cannot go before them.
 */
export async function resetDatabase(prisma: PrismaService): Promise<void> {
  await prisma.repaymentAllocation.deleteMany();
  await prisma.receipt.deleteMany();
  await prisma.transaction.deleteMany();
  await prisma.savingsGoal.deleteMany();
  await prisma.monthlyBudget.deleteMany();
  await prisma.wallet.deleteMany();
  await prisma.category.deleteMany();
  await prisma.refreshToken.deleteMany();
  await prisma.user.deleteMany();
}

/** The wallet every seeded user gets (PRD v2 section 4.2). */
export async function defaultWalletId(harness: Harness): Promise<number> {
  const wallet = await harness.prisma.wallet.findFirst({
    where: { userId: harness.userId, isDefault: true },
  });

  if (!wallet) throw new Error('the seeded user has no default wallet');
  return wallet.id;
}

export async function firstCategoryId(harness: Harness): Promise<number> {
  const category = await harness.prisma.category.findFirst({
    where: { userId: harness.userId },
    orderBy: { sortOrder: 'asc' },
  });

  if (!category) throw new Error('seed categories are missing');
  return category.id;
}

/**
 * Yesterday in Asia/Jakarta.
 *
 * Tests use a past date rather than a fixed one so they never trip the future-date rule
 * (PRD 6.9) as the calendar rolls forward.
 */
export function yesterdayWib(): string {
  const today = new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Asia/Jakarta',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(new Date());

  const [year, month, day] = today.split('-').map(Number);
  return new Date(Date.UTC(year, month - 1, day - 1)).toISOString().slice(0, 10);
}

export function todayWib(): string {
  return new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Asia/Jakarta',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(new Date());
}

export function tomorrowWib(): string {
  const [year, month, day] = todayWib().split('-').map(Number);
  return new Date(Date.UTC(year, month - 1, day + 1)).toISOString().slice(0, 10);
}
