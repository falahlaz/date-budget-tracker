import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import { IsInt, IsOptional, IsString, MaxLength, Min } from 'class-validator';
import { MONEY_MAX } from '@/common/utils/money';

export class UpsertBudgetDto {
  @ApiProperty({ minimum: 1, example: 2_200_000, description: 'Whole rupiah' })
  @Type(() => Number)
  @IsInt({ message: 'amount must be a whole number of rupiah' })
  @Min(1, { message: 'amount must be at least 1' })
  amount!: number;

  @ApiPropertyOptional({ maxLength: 255 })
  @IsOptional()
  @IsString()
  @MaxLength(255)
  note?: string;
}

/** Guards the INT column bound; anything larger is a typo, not a budget. */
export const MAX_BUDGET_AMOUNT = MONEY_MAX;
