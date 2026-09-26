import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { PaymentMethod } from '@prisma/client';
import { Type } from 'class-transformer';
import { IsEnum, IsInt, IsOptional, IsString, Matches, MaxLength, Min } from 'class-validator';

/**
 * Paying one period of a bill. The wallet is required: which wallet the money leaves is
 * the one decision the user always makes by hand.
 */
export class PayBillDto {
  @ApiProperty({ description: 'The wallet the money leaves' })
  @Type(() => Number)
  @IsInt({ message: 'walletId is required' })
  @Min(1, { message: 'walletId is required' })
  walletId!: number;

  @ApiPropertyOptional({ minimum: 1, description: "Defaults to the bill's amount" })
  @IsOptional()
  @Type(() => Number)
  @IsInt({ message: 'amount must be a whole number of rupiah' })
  @Min(1, { message: 'amount must be at least 1' })
  amount?: number;

  @ApiPropertyOptional({ example: '2026-09-26', description: 'Defaults to today' })
  @IsOptional()
  @Matches(/^\d{4}-\d{2}-\d{2}$/, { message: 'occurredOn must be formatted YYYY-MM-DD' })
  occurredOn?: string;

  @ApiPropertyOptional({
    example: '2026-09',
    description: 'Which month this settles. Defaults to the oldest unpaid one.',
  })
  @IsOptional()
  @Matches(/^\d{4}-(0[1-9]|1[0-2])$/, { message: 'period must be formatted YYYY-MM' })
  period?: string;

  @ApiPropertyOptional({
    enum: PaymentMethod,
    default: PaymentMethod.TRANSFER,
    description: 'Date-budget wallets only',
  })
  @IsOptional()
  @IsEnum(PaymentMethod, { message: 'paymentMethod is not a supported payment method' })
  paymentMethod?: PaymentMethod;

  @ApiPropertyOptional({ maxLength: 500 })
  @IsOptional()
  @IsString()
  @MaxLength(500)
  note?: string;
}
