import { ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import { IsIn, IsInt, IsOptional, IsString, Matches, Max, MaxLength, Min } from 'class-validator';

export const DEFAULT_EXPENSE_LIMIT = 50;
export const MAX_EXPENSE_LIMIT = 200;
export const DEFAULT_EXPENSE_SORT = 'spentOn:desc,id:desc';

export class QueryExpensesDto {
  @ApiPropertyOptional({ example: '2026-09' })
  @IsOptional()
  @Matches(/^\d{4}-(0[1-9]|1[0-2])$/, { message: 'period must be formatted YYYY-MM' })
  period?: string;

  @ApiPropertyOptional({ example: '2026-09-01' })
  @IsOptional()
  @Matches(/^\d{4}-\d{2}-\d{2}$/, { message: 'from must be formatted YYYY-MM-DD' })
  from?: string;

  @ApiPropertyOptional({ example: '2026-09-30' })
  @IsOptional()
  @Matches(/^\d{4}-\d{2}-\d{2}$/, { message: 'to must be formatted YYYY-MM-DD' })
  to?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  categoryId?: number;

  @ApiPropertyOptional({ description: 'Normalised place key, from byMerchant or the suggestions endpoint' })
  @IsOptional()
  @IsString()
  @MaxLength(120)
  merchantKey?: string;

  @ApiPropertyOptional({ description: 'Free-text search across merchant and note' })
  @IsOptional()
  @IsString()
  @MaxLength(120)
  q?: string;

  @ApiPropertyOptional({ enum: ['WEEKDAY', 'WEEKEND'] })
  @IsOptional()
  @IsIn(['WEEKDAY', 'WEEKEND'], { message: 'dayType must be WEEKDAY or WEEKEND' })
  dayType?: 'WEEKDAY' | 'WEEKEND';

  @ApiPropertyOptional({ minimum: 1, maximum: 6, description: 'Requires period' })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(6)
  weekIndex?: number;

  @ApiPropertyOptional({ default: DEFAULT_EXPENSE_LIMIT, maximum: MAX_EXPENSE_LIMIT })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(MAX_EXPENSE_LIMIT, { message: `limit must be at most ${MAX_EXPENSE_LIMIT}` })
  limit?: number;

  @ApiPropertyOptional({ default: 0 })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(0)
  offset?: number;

  @ApiPropertyOptional({ default: DEFAULT_EXPENSE_SORT, example: 'amount:desc' })
  @IsOptional()
  @IsString()
  @MaxLength(60)
  sort?: string;
}

export class QueryMerchantsDto {
  @ApiPropertyOptional({ description: 'Normalised server-side before matching' })
  @IsOptional()
  @IsString()
  @MaxLength(120)
  q?: string;

  @ApiPropertyOptional({ default: 10, maximum: 50 })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(50, { message: 'limit must be at most 50' })
  limit?: number;
}
