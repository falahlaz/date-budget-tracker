import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { PaymentMethod } from '@prisma/client';
import { Type } from 'class-transformer';
import { IsEnum, IsInt, IsOptional, IsString, Matches, MaxLength, Min } from 'class-validator';

export class CreateExpenseDto {
  @ApiProperty({ example: '2026-09-05', description: 'Calendar date in Asia/Jakarta' })
  @Matches(/^\d{4}-\d{2}-\d{2}$/, { message: 'spentOn must be formatted YYYY-MM-DD' })
  spentOn!: string;

  @ApiProperty({ minimum: 1, example: 125_000, description: 'Whole rupiah' })
  @Type(() => Number)
  @IsInt({ message: 'amount must be a whole number of rupiah' })
  @Min(1, { message: 'amount must be at least 1' })
  amount!: number;

  @ApiPropertyOptional({ description: 'Optional; uncategorised spend is reported separately' })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  categoryId?: number;

  @ApiPropertyOptional({
    maxLength: 120,
    example: 'Bakmi GM',
    description: 'Place name, stored verbatim. merchantKey is derived by the server.',
  })
  @IsOptional()
  @IsString()
  @MaxLength(120, { message: 'merchant must be at most 120 characters' })
  merchant?: string;

  @ApiPropertyOptional({ enum: PaymentMethod, default: PaymentMethod.CASH })
  @IsOptional()
  @IsEnum(PaymentMethod, { message: 'paymentMethod is not a supported payment method' })
  paymentMethod?: PaymentMethod;

  @ApiPropertyOptional({ maxLength: 500 })
  @IsOptional()
  @IsString()
  @MaxLength(500)
  note?: string;
}
