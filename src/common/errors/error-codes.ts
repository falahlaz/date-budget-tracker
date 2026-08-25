import { HttpStatus } from '@nestjs/common';

/**
 * The complete error catalogue (PRD section 8.1).
 *
 * TOO_MANY_REQUESTS is not spelled out in the PRD's list but 8.2 mandates a 429 for the
 * login rate limit, so it belongs here rather than falling through to INTERNAL_ERROR.
 */
export const ERROR_CODES = {
  VALIDATION_ERROR: HttpStatus.UNPROCESSABLE_ENTITY,
  UNAUTHORIZED: HttpStatus.UNAUTHORIZED,
  FORBIDDEN: HttpStatus.FORBIDDEN,
  NOT_FOUND: HttpStatus.NOT_FOUND,
  CONFLICT: HttpStatus.CONFLICT,
  PAYLOAD_TOO_LARGE: HttpStatus.PAYLOAD_TOO_LARGE,
  UNSUPPORTED_MEDIA_TYPE: HttpStatus.UNSUPPORTED_MEDIA_TYPE,
  TOO_MANY_REQUESTS: HttpStatus.TOO_MANY_REQUESTS,
  INTERNAL_ERROR: HttpStatus.INTERNAL_SERVER_ERROR,
} as const;

export type ErrorCode = keyof typeof ERROR_CODES;

const STATUS_TO_CODE = new Map<number, ErrorCode>(
  (Object.entries(ERROR_CODES) as [ErrorCode, number][]).map(([code, status]) => [status, code]),
);

/** Maps an HTTP status onto the PRD's error code, defaulting to INTERNAL_ERROR. */
export function errorCodeForStatus(status: number): ErrorCode {
  if (STATUS_TO_CODE.has(status)) {
    return STATUS_TO_CODE.get(status) as ErrorCode;
  }
  // 400 is not in the PRD catalogue; the closest documented meaning is a bad payload.
  if (status === HttpStatus.BAD_REQUEST) return 'VALIDATION_ERROR';
  if (status >= 500) return 'INTERNAL_ERROR';
  return 'VALIDATION_ERROR';
}

export interface ErrorDetail {
  field: string;
  constraint: string;
}

export interface ErrorResponseBody {
  statusCode: number;
  error: ErrorCode;
  message: string;
  details?: ErrorDetail[];
  timestamp: string;
  path: string;
}
