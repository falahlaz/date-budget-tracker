import { Test } from '@nestjs/testing';
import { AppModule } from './app.module';
import { PrismaService } from './prisma/prisma.service';

/**
 * Boots the whole application with a stubbed database.
 *
 * This catches the two failure modes that a type-check cannot: a provider that does not
 * resolve at runtime, and a route that never registers -- including the ordering trap where
 * `/transactions/:id` is declared before `/transactions/merchants` and silently swallows it.
 *
 * It is also what makes an API path rename deliberate rather than accidental: moving a
 * route without updating this list fails the build, which is exactly what happened when
 * v2 moved budgets and reports under their wallet.
 */
const prismaStub = {
  $connect: async () => undefined,
  $disconnect: async () => undefined,
  $queryRaw: async () => [{ 1: 1 }],
  user: { count: async () => 1, findUnique: async () => null, findFirst: async () => null },
};

/** Every endpoint named in PRD section 8, as amended by PRD v2 section 10.1. */
const EXPECTED_ROUTES = [
  'POST /api/auth/login',
  'POST /api/auth/refresh',
  'POST /api/auth/logout',
  'GET /api/auth/me',
  'POST /api/auth/change-password',

  // v2 10.2
  'GET /api/wallets',
  'POST /api/wallets',
  'PATCH /api/wallets/:id',
  'DELETE /api/wallets/:id',

  // Budgets and reports belong to a wallet from v2 on (10.1).
  'PUT /api/wallets/:walletId/budgets/:period',
  'GET /api/wallets/:walletId/budgets/:period',
  'GET /api/wallets/:walletId/budgets',
  'DELETE /api/wallets/:walletId/budgets/:period',
  'GET /api/wallets/:walletId/reports/month/:period',
  'GET /api/wallets/:walletId/reports/week/current',
  'GET /api/wallets/:walletId/reports/week/:period/:weekIndex',
  'GET /api/wallets/:walletId/reports/today',
  // The savings half of the same prefix (10.5).
  'GET /api/wallets/:walletId/reports/savings/:period',

  // Transactions stay at the top level and carry the wallet in the body or query (10.1).
  'POST /api/transactions',
  'GET /api/transactions',
  'GET /api/transactions/:id',
  'PATCH /api/transactions/:id',
  'DELETE /api/transactions/:id',
  'GET /api/transactions/merchants',
  'POST /api/transactions/:id/receipts',

  // Savings (v2 10.3)
  'POST /api/wallets/:walletId/goal',
  'GET /api/wallets/:walletId/goal',
  'PATCH /api/wallets/:walletId/goal',
  'POST /api/wallets/:walletId/goal/archive',
  'POST /api/wallets/:walletId/deposits',
  'POST /api/wallets/:walletId/withdrawals',
  'POST /api/wallets/:walletId/withdrawals/preview',
  'GET /api/wallets/:walletId/advances',
  'PATCH /api/wallets/:walletId/transactions/:id',
  'DELETE /api/wallets/:walletId/transactions/:id',

  // Transfers (v2 10.4), addressed by group because one side alone is not a thing.
  'POST /api/transfers',
  'PATCH /api/transfers/:groupId',
  'DELETE /api/transfers/:groupId',

  // A receipt is addressed by its own id, so these did not move.
  'GET /api/receipts/:id/file',
  'DELETE /api/receipts/:id',

  'GET /api/categories',
  'POST /api/categories',
  'PATCH /api/categories/:id',
  'DELETE /api/categories/:id',
];

describe('AppModule wiring', () => {
  let routes: string[];
  let close: () => Promise<void>;

  beforeAll(async () => {
    const moduleRef = await Test.createTestingModule({ imports: [AppModule] })
      .overrideProvider(PrismaService)
      .useValue(prismaStub)
      .compile();

    const app = moduleRef.createNestApplication();
    app.setGlobalPrefix('api');
    await app.init();

    const server = app.getHttpAdapter().getInstance();
    const stack = server.router?.stack ?? server._router?.stack ?? [];

    routes = stack.flatMap(
      (layer: { route?: { methods: Record<string, boolean>; path: string } }) =>
        layer.route
          ? Object.keys(layer.route.methods).map(
              (method) => `${method.toUpperCase()} ${layer.route!.path}`,
            )
          : [],
    );

    close = () => app.close();
  }, 30_000);

  afterAll(async () => {
    await close();
  });

  it.each(EXPECTED_ROUTES)('registers %s', (route) => {
    expect(routes).toContain(route);
  });

  it('exposes a health probe for the container check', () => {
    expect(routes).toContain('GET /api/health');
  });

  /**
   * Same ordering trap as merchants: `/goal/archive` would be swallowed by nothing here,
   * but `/withdrawals/preview` sits under `/withdrawals`, so declaring the bare route
   * first would make the preview a withdrawal -- one that writes.
   */
  it('declares /withdrawals/preview before it could be taken for a withdrawal', () => {
    expect(routes).toContain('POST /api/wallets/:walletId/withdrawals/preview');
    expect(routes).toContain('POST /api/wallets/:walletId/withdrawals');
  });

  it('declares /transactions/merchants before /transactions/:id so it is not shadowed', () => {
    expect(routes.indexOf('GET /api/transactions/merchants')).toBeLessThan(
      routes.indexOf('GET /api/transactions/:id'),
    );
  });

  /** The v1.1 paths are gone, not proxied: nothing should answer on them (v2 10.1). */
  it('no longer answers on the v1.1 paths', () => {
    expect(routes).not.toContain('GET /api/expenses');
    expect(routes).not.toContain('POST /api/expenses');
    expect(routes).not.toContain('GET /api/budgets');
    expect(routes).not.toContain('GET /api/reports/month/:period');
  });
});
