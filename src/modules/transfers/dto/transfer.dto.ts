import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import { IsInt, IsOptional, IsString, Matches, MaxLength, Min } from 'class-validator';

export class CreateTransferDto {
  @ApiProperty({ description: 'Wallet the money leaves' })
  @Type(() => Number)
  @IsInt()
  @Min(1)
  fromWalletId!: number;

  @ApiProperty({ description: 'Wallet the money arrives in; must differ (8.10)' })
  @Type(() => Number)
  @IsInt()
  @Min(1)
  toWalletId!: number;

  @ApiProperty({ minimum: 1, example: 320_000 })
  @Type(() => Number)
  @IsInt({ message: 'amount must be a whole number of rupiah' })
  @Min(1, { message: 'amount must be at least 1' })
  amount!: number;

  @ApiProperty({ example: '2026-09-03' })
  @Matches(/^\d{4}-\d{2}-\d{2}$/, { message: 'occurredOn must be formatted YYYY-MM-DD' })
  occurredOn!: string;

  @ApiPropertyOptional({ maxLength: 500 })
  @IsOptional()
  @IsString()
  @MaxLength(500)
  note?: string;
}

/**
 * Edits both sides at once (PRD v2 10.4).
 *
 * The wallets are not editable: changing where a transfer went is a different transfer,
 * and expressing it as an edit would mean unwinding two wallets' worth of effect and
 * reapplying it elsewhere -- delete and recreate says the same thing without the trap.
 */
export class UpdateTransferDto {
  @ApiPropertyOptional({ minimum: 1 })
  @IsOptional()
  @Type(() => Number)
  @IsInt({ message: 'amount must be a whole number of rupiah' })
  @Min(1, { message: 'amount must be at least 1' })
  amount?: number;

  @ApiPropertyOptional({ example: '2026-09-16' })
  @IsOptional()
  @Matches(/^\d{4}-\d{2}-\d{2}$/, { message: 'occurredOn must be formatted YYYY-MM-DD' })
  occurredOn?: string;

  @ApiPropertyOptional({ maxLength: 500 })
  @IsOptional()
  @IsString()
  @MaxLength(500)
  note?: string;
}
