import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Transform, Type } from 'class-transformer';
import { IsInt, IsOptional, IsString, Matches, MaxLength, Min, MinLength } from 'class-validator';

const DATE = /^\d{4}-\d{2}-\d{2}$/;
const trim = ({ value }: { value: unknown }) => (typeof value === 'string' ? value.trim() : value);

export class CreateLoanDto {
  @ApiProperty({ maxLength: 80, example: 'Budi' })
  @Transform(trim)
  @IsString({ message: 'borrowerName is required' })
  @MinLength(1, { message: 'borrowerName is required' })
  @MaxLength(80, { message: 'borrowerName must be at most 80 characters' })
  borrowerName!: string;

  @ApiProperty({ minimum: 1, example: 500_000, description: 'Whole rupiah' })
  @Type(() => Number)
  @IsInt({ message: 'amount must be a whole number of rupiah' })
  @Min(1, { message: 'amount must be at least 1' })
  amount!: number;

  @ApiProperty({ description: 'The wallet the money leaves' })
  @Type(() => Number)
  @IsInt({ message: 'walletId is required' })
  @Min(1, { message: 'walletId is required' })
  walletId!: number;

  @ApiPropertyOptional({
    example: '2026-09-29',
    description: 'When it was lent. Defaults to today',
  })
  @IsOptional()
  @Matches(DATE, { message: 'lentOn must be formatted YYYY-MM-DD' })
  lentOn?: string;

  @ApiPropertyOptional({ example: '2026-10-25', description: 'When it was promised back' })
  @IsOptional()
  @Matches(DATE, { message: 'dueDate must be formatted YYYY-MM-DD' })
  dueDate?: string | null;

  @ApiPropertyOptional({ maxLength: 255 })
  @IsOptional()
  @IsString()
  @MaxLength(255)
  note?: string | null;
}
