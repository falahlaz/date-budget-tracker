import { ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import { IsInt, IsOptional, IsString, Matches, MaxLength, Min } from 'class-validator';

/** Money coming back from a borrower: all of what is left, or part of it. */
export class RepayLoanDto {
  @ApiPropertyOptional({ minimum: 1, description: 'Defaults to everything still owed' })
  @IsOptional()
  @Type(() => Number)
  @IsInt({ message: 'amount must be a whole number of rupiah' })
  @Min(1, { message: 'amount must be at least 1' })
  amount?: number;

  @ApiPropertyOptional({
    description: 'The wallet the money goes back into. Defaults to the one it left',
  })
  @IsOptional()
  @Type(() => Number)
  @IsInt({ message: 'walletId must be a wallet id' })
  @Min(1, { message: 'walletId must be a wallet id' })
  walletId?: number;

  @ApiPropertyOptional({ example: '2026-10-05', description: 'Defaults to today' })
  @IsOptional()
  @Matches(/^\d{4}-\d{2}-\d{2}$/, { message: 'occurredOn must be formatted YYYY-MM-DD' })
  occurredOn?: string;

  @ApiPropertyOptional({ maxLength: 500 })
  @IsOptional()
  @IsString()
  @MaxLength(500)
  note?: string;
}
