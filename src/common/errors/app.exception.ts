import { HttpException } from '@nestjs/common';
import { ERROR_CODES, ErrorCode, ErrorDetail } from './error-codes';

/**
 * Domain exception carrying a PRD error code, so the filter never has to guess the code
 * from an HTTP status alone.
 */
export class AppException extends HttpException {
  constructor(
    readonly code: ErrorCode,
    message: string,
    readonly details?: ErrorDetail[],
  ) {
    super({ code, message, details }, ERROR_CODES[code]);
  }

  static validation(message: string, details?: ErrorDetail[]): AppException {
    return new AppException('VALIDATION_ERROR', message, details);
  }

  static notFound(message: string): AppException {
    return new AppException('NOT_FOUND', message);
  }

  static conflict(message: string): AppException {
    return new AppException('CONFLICT', message);
  }

  static forbidden(message: string): AppException {
    return new AppException('FORBIDDEN', message);
  }

  static unauthorized(message: string): AppException {
    return new AppException('UNAUTHORIZED', message);
  }

  static payloadTooLarge(message: string): AppException {
    return new AppException('PAYLOAD_TOO_LARGE', message);
  }

  static unsupportedMediaType(message: string): AppException {
    return new AppException('UNSUPPORTED_MEDIA_TYPE', message);
  }

  static tooManyRequests(message: string): AppException {
    return new AppException('TOO_MANY_REQUESTS', message);
  }
}
