import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Transform, Type } from 'class-transformer';
import {
  IsBoolean,
  IsInt,
  IsOptional,
  IsString,
  Matches,
  MaxLength,
  Min,
  MinLength,
} from 'class-validator';

export class CreateWithdrawalDto {
  @ApiProperty({ minimum: 1, example: 500_000 })
  @Type(() => Number)
  @IsInt({ message: 'amount must be a whole number of rupiah' })
  @Min(1, { message: 'amount must be at least 1' })
  amount!: number;

  @ApiProperty({ example: '2026-09-14' })
  @Matches(/^\d{4}-\d{2}-\d{2}$/, { message: 'occurredOn must be formatted YYYY-MM-DD' })
  occurredOn!: string;

  /**
   * REQUIRED, and required here at the DTO rather than as an optional field with a check
   * further in (PRD v2 8.13).
   *
   * This is goal G2 in one field: the whole problem v2 solves is money leaving the savings
   * account with no record of where it went. An optional `reason` validated somewhere else
   * is one refactor away from being optional in fact.
   */
  @ApiProperty({ maxLength: 200, example: 'Kado nikahan sepupu' })
  // Trimmed BEFORE the length check, or "   " satisfies MinLength(1) and is stored as an
  // empty reason -- a reason in name only, which is the thing 8.13 exists to prevent.
  @Transform(({ value }) => (typeof value === 'string' ? value.trim() : value))
  @IsString({ message: 'reason is required' })
  @MinLength(1, { message: 'reason is required' })
  @MaxLength(200, { message: 'reason must be at most 200 characters' })
  reason!: string;

  @ApiProperty({ description: 'Required: withdrawals are always categorised (8.13)' })
  @Type(() => Number)
  @IsInt({ message: 'categoryId is required' })
  @Min(1, { message: 'categoryId is required' })
  categoryId!: number;

  /** "bakal gw balikin" -- marks this as a debt to yourself (5.1, G5). */
  @ApiPropertyOptional({ default: false })
  @IsOptional()
  @IsBoolean()
  expectedReturn?: boolean;

  @ApiPropertyOptional({ maxLength: 500 })
  @IsOptional()
  @IsString()
  @MaxLength(500)
  note?: string;
}

/** The friction dialog's input (PRD v2 10.3). Nothing is written. */
export class PreviewWithdrawalDto {
  @ApiProperty({ minimum: 1, example: 500_000 })
  @Type(() => Number)
  @IsInt({ message: 'amount must be a whole number of rupiah' })
  @Min(1, { message: 'amount must be at least 1' })
  amount!: number;
}
