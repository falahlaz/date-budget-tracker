import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import { IsBoolean, IsInt, IsOptional, IsString, Matches, MaxLength, Min } from 'class-validator';

export class CreateWithdrawalDto {
  @ApiProperty({ minimum: 1, example: 500_000 })
  @Type(() => Number)
  @IsInt({ message: 'amount must be a whole number of rupiah' })
  @Min(1, { message: 'amount must be at least 1' })
  amount!: number;

  @ApiProperty({ example: '2026-09-14' })
  @Matches(/^\d{4}-\d{2}-\d{2}$/, { message: 'occurredOn must be formatted YYYY-MM-DD' })
  occurredOn!: string;

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

  /** Why the money left, in the user's own words. Optional; the category is not. */
  @ApiPropertyOptional({ maxLength: 500, example: 'Kado nikahan sepupu' })
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

/**
 * Editing a savings transaction (PRD v2 8.7, 8.16).
 *
 * The wallet, the kind and the allocations are absent on purpose. Moving a row to another
 * wallet or turning a deposit into a withdrawal is a different transaction; expressing it
 * as an edit would mean unwinding one balance and reapplying it elsewhere, and deleting
 * and re-recording says the same thing without the trap.
 */
export class UpdateSavingsTransactionDto {
  @ApiPropertyOptional({ minimum: 1, example: 1_500_000 })
  @IsOptional()
  @Type(() => Number)
  @IsInt({ message: 'amount must be a whole number of rupiah' })
  @Min(1, { message: 'amount must be at least 1' })
  amount?: number;

  @ApiPropertyOptional({ example: '2026-08-09' })
  @IsOptional()
  @Matches(/^\d{4}-\d{2}-\d{2}$/, { message: 'occurredOn must be formatted YYYY-MM-DD' })
  occurredOn?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  categoryId?: number;

  @ApiPropertyOptional()
  @IsOptional()
  @IsBoolean()
  expectedReturn?: boolean;

  @ApiPropertyOptional({ maxLength: 500 })
  @IsOptional()
  @IsString()
  @MaxLength(500)
  note?: string | null;
}
