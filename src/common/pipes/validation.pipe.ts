import { HttpStatus, ValidationPipe } from '@nestjs/common';
import { ValidationError } from 'class-validator';
import { AppException, ErrorDetail } from '../errors';

/** Flattens nested class-validator errors into the PRD's `details` array. */
function collectDetails(errors: ValidationError[], parentPath = ''): ErrorDetail[] {
  return errors.flatMap((error) => {
    const field = parentPath ? `${parentPath}.${error.property}` : error.property;
    const own = Object.keys(error.constraints ?? {}).map((constraint) => ({ field, constraint }));
    const nested = error.children?.length ? collectDetails(error.children, field) : [];
    return [...own, ...nested];
  });
}

function firstMessage(errors: ValidationError[]): string {
  for (const error of errors) {
    const messages = Object.values(error.constraints ?? {});
    if (messages.length > 0) return messages[0];
    if (error.children?.length) {
      const nested = firstMessage(error.children);
      if (nested) return nested;
    }
  }
  return 'Validation failed';
}

/**
 * Global validation pipe.
 *
 * `whitelist: true` strips unknown properties, which is what makes a client-supplied
 * `merchantKey` disappear before it can reach the service -- the server always derives
 * that column itself (PRD 7.3, 8.4).
 *
 * DEVIATION: PRD 10.1 asks for `forbidNonWhitelisted: true`, but test E15 (12.2) requires
 * a client-sent `merchantKey` to be *ignored*, not rejected with a 422. Rejecting would
 * also break every future client that sends a field this server version does not know.
 * The behavioural acceptance test wins, so unknown properties are stripped silently.
 *
 * Validation failures answer 422 VALIDATION_ERROR, not Nest's default 400.
 */
export function buildValidationPipe(): ValidationPipe {
  return new ValidationPipe({
    whitelist: true,
    forbidNonWhitelisted: false,
    transform: true,
    transformOptions: { enableImplicitConversion: false },
    errorHttpStatusCode: HttpStatus.UNPROCESSABLE_ENTITY,
    exceptionFactory: (errors: ValidationError[]) =>
      AppException.validation(firstMessage(errors), collectDetails(errors)),
  });
}
