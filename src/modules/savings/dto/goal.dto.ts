import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import { IsInt, IsOptional, IsString, Matches, MaxLength, Min, MinLength } from 'class-validator';

const DATE = /^\d{4}-\d{2}-\d{2}$/;

export class CreateGoalDto {
  @ApiProperty({ maxLength: 80, example: 'Liburan Jepang' })
  @IsString()
  @MinLength(1, { message: 'name must not be empty' })
  @MaxLength(80)
  name!: string;

  @ApiProperty({ minimum: 1, example: 30_000_000, description: 'Whole rupiah' })
  @Type(() => Number)
  @IsInt({ message: 'targetAmount must be a whole number of rupiah' })
  @Min(1, { message: 'targetAmount must be at least 1' })
  targetAmount!: number;

  @ApiPropertyOptional({ minimum: 0, description: 'What is already in the account' })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(0, { message: 'openingBalance must not be negative' })
  openingBalance?: number;

  @ApiProperty({ example: '2026-05-01' })
  @Matches(DATE, { message: 'startDate must be formatted YYYY-MM-DD' })
  startDate!: string;

  @ApiProperty({ example: '2027-08-31', description: 'Must not fall before startDate (8.12)' })
  @Matches(DATE, { message: 'deadline must be formatted YYYY-MM-DD' })
  deadline!: string;

  @ApiPropertyOptional({ maxLength: 255 })
  @IsOptional()
  @IsString()
  @MaxLength(255)
  note?: string;
}

/**
 * Editing a goal mid-flight (PRD v2 8.6).
 *
 * `startDate` is absent: `plan_per_month` is recomputed from the original start so the
 * pace baseline stays one straight line, and moving the start would rewrite history the
 * PRD says is not recomputed.
 */
export class UpdateGoalDto {
  @ApiPropertyOptional({ maxLength: 80 })
  @IsOptional()
  @IsString()
  @MinLength(1, { message: 'name must not be empty' })
  @MaxLength(80)
  name?: string;

  @ApiPropertyOptional({ minimum: 1 })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1, { message: 'targetAmount must be at least 1' })
  targetAmount?: number;

  @ApiPropertyOptional({ example: '2027-12-31' })
  @IsOptional()
  @Matches(DATE, { message: 'deadline must be formatted YYYY-MM-DD' })
  deadline?: string;

  @ApiPropertyOptional({ maxLength: 255 })
  @IsOptional()
  @IsString()
  @MaxLength(255)
  note?: string;
}
