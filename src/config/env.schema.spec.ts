import { validateEnv } from './env.schema';

const base = {
  DATABASE_URL: 'mysql://datebud:datebud@localhost:3306/datebud',
  JWT_SECRET: 'a'.repeat(64),
};

describe('validateEnv', () => {
  it('applies documented defaults when optional vars are absent', () => {
    const env = validateEnv(base);

    expect(env.NODE_ENV).toBe('development');
    expect(env.PORT).toBe(3000);
    expect(env.APP_TZ).toBe('Asia/Jakarta');
    expect(env.JWT_ACCESS_TTL).toBe('15m');
    expect(env.REFRESH_TTL_DAYS).toBe(30);
    expect(env.MAX_UPLOAD_MB).toBe(10);
    expect(env.MAX_RECEIPTS_PER_EXPENSE).toBe(5);
  });

  it('coerces numeric vars that arrive as strings', () => {
    const env = validateEnv({ ...base, PORT: '8080', MAX_UPLOAD_MB: '25' });

    expect(env.PORT).toBe(8080);
    expect(env.MAX_UPLOAD_MB).toBe(25);
  });

  it('throws when DATABASE_URL is missing', () => {
    expect(() => validateEnv({ JWT_SECRET: 'a'.repeat(64) })).toThrow(/DATABASE_URL/);
  });

  it('throws when JWT_SECRET is too short to be safe', () => {
    expect(() => validateEnv({ ...base, JWT_SECRET: 'short' })).toThrow(/JWT_SECRET/);
  });

  it('reports every problem in one message', () => {
    expect(() => validateEnv({})).toThrow(/DATABASE_URL[\s\S]*JWT_SECRET/);
  });
});
