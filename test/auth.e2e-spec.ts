import { createHarness, Harness, TEST_USER } from './app-harness';

describe('Auth (PRD 8.2)', () => {
  let harness: Harness;

  beforeAll(async () => {
    harness = await createHarness();
  });

  afterAll(async () => {
    await harness.close();
  });

  // E2
  it('rejects an unauthenticated request with 401 in the standard envelope', async () => {
    const response = await harness.http().get('/api/expenses').expect(401);

    expect(response.body).toMatchObject({
      statusCode: 401,
      error: 'UNAUTHORIZED',
      path: '/api/expenses',
    });
    expect(typeof response.body.timestamp).toBe('string');
  });

  it('returns the signed-in user from /auth/me', async () => {
    const response = await harness
      .http()
      .get('/api/auth/me')
      .set('Authorization', harness.auth)
      .expect(200);

    expect(response.body).toMatchObject({ email: TEST_USER.email, displayName: TEST_USER.displayName });
    expect(response.body.passwordHash).toBeUndefined();
  });

  it('sets an httpOnly refresh cookie on login and rotates it on refresh', async () => {
    const login = await harness
      .http()
      .post('/api/auth/login')
      .send({ email: TEST_USER.email, password: TEST_USER.password })
      .expect(200);

    const cookie = login.get('Set-Cookie')?.find((value) => value.startsWith('refresh_token='));
    expect(cookie).toBeDefined();
    expect(cookie).toContain('HttpOnly');
    expect(cookie).toContain('SameSite=Lax');

    const refresh = await harness.http().post('/api/auth/refresh').set('Cookie', cookie!).expect(200);
    expect(typeof refresh.body.accessToken).toBe('string');

    const rotated = refresh.get('Set-Cookie')?.find((value) => value.startsWith('refresh_token='));
    expect(rotated).toBeDefined();
    expect(rotated).not.toBe(cookie);

    // The old token was revoked the moment it was used, so replaying it must fail.
    await harness.http().post('/api/auth/refresh').set('Cookie', cookie!).expect(401);
  });

  it('rejects a wrong password without revealing whether the account exists', async () => {
    const wrongPassword = await harness
      .http()
      .post('/api/auth/login')
      .send({ email: TEST_USER.email, password: 'not-the-password' })
      .expect(401);

    const unknownEmail = await harness
      .http()
      .post('/api/auth/login')
      .send({ email: 'nobody@datebud.test', password: 'whatever-123' })
      .expect(401);

    expect(unknownEmail.body.message).toBe(wrongPassword.body.message);
  });

  it('has no public registration endpoint (PRD 3)', async () => {
    await harness.http().post('/api/auth/register').send({ email: 'x@y.z', password: 'abc' }).expect(404);
  });
});
