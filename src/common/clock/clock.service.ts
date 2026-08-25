import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { formatInTimeZone } from 'date-fns-tz';
import { Env } from '@/config/env.schema';

/**
 * The single place the application is allowed to ask what day it is.
 *
 * "Today" is always resolved in APP_TZ (Asia/Jakarta), never UTC -- an expense entered at
 * 23:30 WIB on the 5th belongs to the 5th (PRD 6.13). Keeping this behind a service also
 * keeps the calculation engine pure: it receives a date string instead of reading a clock.
 */
@Injectable()
export class ClockService {
  constructor(private readonly config: ConfigService<Env, true>) {}

  get timeZone(): string {
    return this.config.get('APP_TZ', { infer: true });
  }

  now(): Date {
    return new Date();
  }

  /** Today in the application timezone, as `YYYY-MM-DD`. */
  today(): string {
    return formatInTimeZone(this.now(), this.timeZone, 'yyyy-MM-dd');
  }

  /** The current budget period, as `YYYY-MM`. */
  currentPeriod(): string {
    return this.today().slice(0, 7);
  }
}
