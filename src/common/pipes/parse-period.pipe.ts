import { Injectable, PipeTransform } from '@nestjs/common';
import { AppException } from '../errors';
import { isPeriodString } from '@/modules/reports/engine/calendar';

/** Validates a `:period` route parameter as `YYYY-MM` (PRD 8.1). */
@Injectable()
export class ParsePeriodPipe implements PipeTransform<string, string> {
  transform(value: string): string {
    if (!isPeriodString(value)) {
      throw AppException.validation(`period must be formatted YYYY-MM, got "${value}"`, [
        { field: 'period', constraint: 'format' },
      ]);
    }
    return value;
  }
}
