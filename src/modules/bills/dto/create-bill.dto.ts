import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { BillCategory, BillKind } from '@prisma/client';
import { Transform, Type } from 'class-transformer';
import {
  IsEnum,
  IsInt,
  IsOptional,
  IsString,
  Matches,
  Max,
  MaxLength,
  Min,
  MinLength,
} from 'class-validator';

const PERIOD = /^\d{4}-(0[1-9]|1[0-2])$/;
const trim = ({ value }: { value: unknown }) => (typeof value === 'string' ? value.trim() : value);

export class CreateBillDto {
  @ApiProperty({ maxLength: 80, example: 'Cicilan HP' })
  @Transform(trim)
  @IsString({ message: 'name is required' })
  @MinLength(1, { message: 'name is required' })
  @MaxLength(80, { message: 'name must be at most 80 characters' })
  name!: string;

  @ApiPropertyOptional({ maxLength: 60, example: 'Shopee PayLater' })
  @IsOptional()
  @Transform(trim)
  @IsString()
  @MaxLength(60, { message: 'platform must be at most 60 characters' })
  platform?: string | null;

  @ApiProperty({ minimum: 1, example: 450_000, description: 'Whole rupiah' })
  @Type(() => Number)
  @IsInt({ message: 'amount must be a whole number of rupiah' })
  @Min(1, { message: 'amount must be at least 1' })
  amount!: number;

  @ApiProperty({ enum: BillKind })
  @IsEnum(BillKind, { message: 'kind is not a supported bill kind' })
  kind!: BillKind;

  @ApiProperty({ enum: BillCategory })
  @IsEnum(BillCategory, { message: 'category is not a supported bill category' })
  category!: BillCategory;

  @ApiProperty({ minimum: 1, maximum: 31, example: 25 })
  @Type(() => Number)
  @IsInt({ message: 'dueDay must be a day of the month' })
  @Min(1, { message: 'dueDay must be between 1 and 31' })
  @Max(31, { message: 'dueDay must be between 1 and 31' })
  dueDay!: number;

  @ApiProperty({ example: '2026-09', description: 'First month a payment is owed' })
  @Matches(PERIOD, { message: 'startPeriod must be formatted YYYY-MM' })
  startPeriod!: string;

  @ApiPropertyOptional({
    example: '2027-02',
    description: 'INSTALLMENT: last month owed (required). Ignored for the other kinds.',
  })
  @IsOptional()
  @Matches(PERIOD, { message: 'endPeriod must be formatted YYYY-MM' })
  endPeriod?: string | null;

  @ApiPropertyOptional({ maxLength: 255 })
  @IsOptional()
  @IsString()
  @MaxLength(255)
  note?: string | null;
}
