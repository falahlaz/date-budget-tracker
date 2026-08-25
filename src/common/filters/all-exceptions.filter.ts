import {
  ArgumentsHost,
  Catch,
  ExceptionFilter,
  HttpException,
  HttpStatus,
  Logger,
} from '@nestjs/common';
import { Request, Response } from 'express';
import { MulterError } from 'multer';
import { AppException, ErrorCode, ErrorDetail, ErrorResponseBody, errorCodeForStatus } from '../errors';

/**
 * Renders every failure in the single response shape mandated by PRD section 8.1.
 * Internal errors never leak their message to the client.
 */
@Catch()
export class AllExceptionsFilter implements ExceptionFilter {
  private readonly logger = new Logger(AllExceptionsFilter.name);

  catch(exception: unknown, host: ArgumentsHost): void {
    const ctx = host.switchToHttp();
    const response = ctx.getResponse<Response>();
    const request = ctx.getRequest<Request>();

    const { status, code, message, details } = this.describe(exception);

    if (status >= HttpStatus.INTERNAL_SERVER_ERROR) {
      this.logger.error(
        `${request.method} ${request.url} -> ${status}`,
        exception instanceof Error ? exception.stack : String(exception),
      );
    }

    const body: ErrorResponseBody = {
      statusCode: status,
      error: code,
      message,
      timestamp: new Date().toISOString(),
      path: request.url,
    };

    if (details?.length) {
      body.details = details;
    }

    response.status(status).json(body);
  }

  private describe(exception: unknown): {
    status: number;
    code: ErrorCode;
    message: string;
    details?: ErrorDetail[];
  } {
    if (exception instanceof AppException) {
      return {
        status: exception.getStatus(),
        code: exception.code,
        message: exception.message,
        details: exception.details,
      };
    }

    // Multer rejects oversized or excess uploads before any handler runs, so its errors
    // have to be translated here to reach the client as 413/422 (PRD 8.5, E5).
    if (exception instanceof MulterError) {
      return this.describeMulter(exception);
    }

    if (exception instanceof HttpException) {
      const status = exception.getStatus();
      const payload = exception.getResponse();
      return {
        status,
        code: errorCodeForStatus(status),
        message: this.messageFrom(payload, exception.message),
        details: this.detailsFrom(payload),
      };
    }

    return {
      status: HttpStatus.INTERNAL_SERVER_ERROR,
      code: 'INTERNAL_ERROR',
      message: 'Internal server error',
    };
  }

  private describeMulter(exception: MulterError): {
    status: number;
    code: ErrorCode;
    message: string;
    details?: ErrorDetail[];
  } {
    const field = exception.field ?? 'files';

    if (exception.code === 'LIMIT_FILE_SIZE') {
      return {
        status: HttpStatus.PAYLOAD_TOO_LARGE,
        code: 'PAYLOAD_TOO_LARGE',
        message: 'the uploaded file is larger than the allowed maximum',
        details: [{ field, constraint: 'maxSize' }],
      };
    }

    return {
      status: HttpStatus.UNPROCESSABLE_ENTITY,
      code: 'VALIDATION_ERROR',
      message: `upload rejected: ${exception.message}`,
      details: [{ field, constraint: exception.code }],
    };
  }

  private messageFrom(payload: unknown, fallback: string): string {
    if (typeof payload === 'string') return payload;

    if (payload && typeof payload === 'object' && 'message' in payload) {
      const message = (payload as { message: unknown }).message;
      if (typeof message === 'string') return message;
      if (Array.isArray(message) && message.length > 0) return String(message[0]);
    }

    return fallback;
  }

  private detailsFrom(payload: unknown): ErrorDetail[] | undefined {
    if (payload && typeof payload === 'object' && 'details' in payload) {
      const details = (payload as { details: unknown }).details;
      if (Array.isArray(details)) return details as ErrorDetail[];
    }
    return undefined;
  }
}
