import { ConfigService } from '@nestjs/config';
import { Env } from '@/config/env.schema';
import { ClockService } from './clock.service';

function clockAt(iso: string, timeZone = 'Asia/Jakarta'): ClockService {
  const config = { get: () => timeZone } as unknown as ConfigService<Env, true>;
  const clock = new ClockService(config);
  jest.spyOn(clock, 'now').mockReturnValue(new Date(iso));
  return clock;
}

describe('ClockService', () => {
  it('resolves today in Asia/Jakarta, not UTC (PRD 6.13)', () => {
    // 23:30 WIB on the 5th is 16:30 UTC on the 5th -- same day either way.
    expect(clockAt('2026-09-05T16:30:00Z').today()).toBe('2026-09-05');

    // 00:30 WIB on the 6th is still 17:30 UTC on the 5th; WIB must win.
    expect(clockAt('2026-09-05T17:30:00Z').today()).toBe('2026-09-06');
  });

  it('derives the current period from the WIB date', () => {
    // 07:00 WIB on 1 October is 00:00 UTC -- a UTC-based answer would say September.
    expect(clockAt('2026-10-01T00:00:00Z').currentPeriod()).toBe('2026-10');
    expect(clockAt('2026-09-30T16:59:00Z').currentPeriod()).toBe('2026-09');
  });
});
