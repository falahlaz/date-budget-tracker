import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import {
  ArrayMaxSize,
  IsArray,
  IsBoolean,
  IsInt,
  IsOptional,
  IsString,
  Matches,
  MaxLength,
  Min,
  ValidateNested,
} from 'class-validator';

export class ManualAllocationDto {
  @ApiProperty({ description: 'The WITHDRAW this repays' })
  @Type(() => Number)
  @IsInt()
  @Min(1)
  transactionId!: number;

  @ApiProperty({ minimum: 1 })
  @Type(() => Number)
  @IsInt()
  @Min(1, { message: 'an allocation must be at least 1' })
  amount!: number;
}

export class CreateDepositDto {
  @ApiProperty({ minimum: 1, example: 2_000_000 })
  @Type(() => Number)
  @IsInt({ message: 'amount must be a whole number of rupiah' })
  @Min(1, { message: 'amount must be at least 1' })
  amount!: number;

  @ApiProperty({ example: '2026-09-14' })
  @Matches(/^\d{4}-\d{2}-\d{2}$/, { message: 'occurredOn must be formatted YYYY-MM-DD' })
  occurredOn!: string;

  @ApiPropertyOptional({ maxLength: 500 })
  @IsOptional()
  @IsString()
  @MaxLength(500)
  note?: string;

  /** FIFO across the open advances, oldest first (PRD v2 5.4). */
  @ApiPropertyOptional({ default: false })
  @IsOptional()
  @IsBoolean()
  applyToAdvances?: boolean;

  /** Overrides FIFO. Sent by the sheet when the user edits the proposed split (11.3). */
  @ApiPropertyOptional({ type: [ManualAllocationDto] })
  @IsOptional()
  @IsArray()
  @ArrayMaxSize(50)
  @ValidateNested({ each: true })
  @Type(() => ManualAllocationDto)
  allocations?: ManualAllocationDto[];
}
