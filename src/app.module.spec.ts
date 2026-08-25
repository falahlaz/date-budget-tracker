import { Test } from '@nestjs/testing';
import { AppModule } from './app.module';
import { PrismaService } from './prisma/prisma.service';

/**
 * Boots the whole application with a stubbed database.
 *
 * This catches the two failure modes that a type-check cannot: a provider that does not
 * resolve at runtime, and a route that never registers -- including the ordering trap where
 * `/expenses/:id` is declared before `/expenses/merchants` and silently swallows it.
 */
const prismaStub = {
  $connect: async () => undefined,
  $disconnect: async () => undefined,
  $queryRaw: async () => [{ 1: 1 }],
  user: { count: async () => 1, findUnique: async () => null, findFirst: async () => null },
};

/** Every endpoint named in PRD section 8. */
const EXPECTED_ROUTES = [
  'POST /api/auth/login',
  'POST /api/auth/refresh',
  'POST /api/auth/logout',
  'GET /api/auth/me',
  'POST /api/auth/change-password',
  'PUT /api/budgets/:period',
  'GET /api/budgets/:period',
  'GET /api/budgets',
  'DELETE /api/budgets/:period',
  'POST /api/expenses',
  'GET /api/expenses',
  'GET /api/expenses/:id',
  'PATCH /api/expenses/:id',
  'DELETE /api/expenses/:id',
  'GET /api/expenses/merchants',
  'POST /api/expenses/:id/receipts',
  'GET /api/receipts/:id/file',
  'DELETE /api/receipts/:id',
  'GET /api/reports/month/:period',
  'GET /api/reports/week/current',
  'GET /api/reports/week/:period/:weekIndex',
  'GET /api/reports/today',
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

    routes = stack.flatMap((layer: { route?: { methods: Record<string, boolean>; path: string } }) =>
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

  it('declares /expenses/merchants before /expenses/:id so it is not shadowed', () => {
    expect(routes.indexOf('GET /api/expenses/merchants')).toBeLessThan(
      routes.indexOf('GET /api/expenses/:id'),
    );
  });
});
