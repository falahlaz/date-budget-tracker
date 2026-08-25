import { INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import cookieParser from 'cookie-parser';
import request from 'supertest';
import { AppModule } from '@/app.module';
import { AllExceptionsFilter } from '@/common/filters/all-exceptions.filter';
import { buildValidationPipe } from '@/common/pipes/validation.pipe';
import { PrismaService } from '@/prisma/prisma.service';
import { UsersService } from '@/modules/users/users.service';

export interface Harness {
  app: INestApplication;
  prisma: PrismaService;
  /** Authorization header value for the seeded user. */
  auth: string;
  userId: number;
  http: () => request.Agent;
  close: () => Promise<void>;
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
export async function createHarness(options: { login?: boolean } = {}): Promise<Harness> {
  const moduleRef = await Test.createTestingModule({ imports: [AppModule] }).compile();

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

/** Wipes every table in dependency order. */
export async function resetDatabase(prisma: PrismaService): Promise<void> {
  await prisma.receipt.deleteMany();
  await prisma.expense.deleteMany();
  await prisma.monthlyBudget.deleteMany();
  await prisma.category.deleteMany();
  await prisma.refreshToken.deleteMany();
  await prisma.user.deleteMany();
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
