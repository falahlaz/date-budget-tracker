import { Injectable } from '@nestjs/common';
import { ThrottlerGuard, ThrottlerLimitDetail } from '@nestjs/throttler';
import { AppException } from '@/common/errors';

/** Login attempts are limited per client IP (PRD 8.2: 5 attempts / 15 minutes / IP). */
export const LOGIN_THROTTLER = 'login';
export const LOGIN_THROTTLE_LIMIT = 5;
export const LOGIN_THROTTLE_TTL_MS = 15 * 60 * 1000;

@Injectable()
export class LoginThrottlerGuard extends ThrottlerGuard {
  protected async throwThrottlingException(
    _context: unknown,
    _detail: ThrottlerLimitDetail,
  ): Promise<void> {
    // Rendered through the standard error envelope as TOO_MANY_REQUESTS (429).
    throw AppException.tooManyRequests('too many login attempts, try again later');
  }
}
