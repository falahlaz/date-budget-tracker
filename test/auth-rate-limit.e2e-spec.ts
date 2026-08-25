import { createHarness, Harness, TEST_USER } from './app-harness';

/**
 * Isolated in its own file so the 5-attempt budget is not consumed by other suites'
 * logins -- each Jest file gets its own module instance, and so its own throttler store.
 */
describe('Login rate limit (PRD 8.2)', () => {
  let harness: Harness;

  beforeAll(async () => {
    harness = await createHarness({ login: false });
  });

  afterAll(async () => {
    await harness.close();
  });

  // E11
  it('answers 429 after five failed attempts from the same IP', async () => {
    for (let attempt = 0; attempt < 5; attempt += 1) {
      await harness
        .http()
        .post('/api/auth/login')
        .send({ email: TEST_USER.email, password: 'wrong-password' })
        .expect(401);
    }

    const blocked = await harness
      .http()
      .post('/api/auth/login')
      .send({ email: TEST_USER.email, password: TEST_USER.password })
      .expect(429);

    expect(blocked.body).toMatchObject({ statusCode: 429, error: 'TOO_MANY_REQUESTS' });
  });
});
