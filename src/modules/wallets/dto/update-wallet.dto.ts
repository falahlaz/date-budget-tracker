import { ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import {
  IsBoolean,
  IsInt,
  IsOptional,
  IsString,
  Matches,
  MaxLength,
  Min,
  MinLength,
} from 'class-validator';

/**
 * Everything about a wallet that may change (PRD v2 10.2).
 *
 * `type` is absent on purpose. Changing it would hand a wallet's existing rows to an
 * engine that does not understand them -- a savings balance read as a spending history.
 */
export class UpdateWalletDto {
  @ApiPropertyOptional({ maxLength: 60 })
  @IsOptional()
  @IsString()
  @MinLength(1, { message: 'name must not be empty' })
  @MaxLength(60, { message: 'name must be at most 60 characters' })
  name?: string;

  @ApiPropertyOptional({ example: '#3E8C74' })
  @IsOptional()
  @Matches(/^#[0-9A-Fa-f]{6}$/, { message: 'color must be a #RRGGBB hex value' })
  color?: string;

  @ApiPropertyOptional({ maxLength: 40 })
  @IsOptional()
  @IsString()
  @MaxLength(40)
  icon?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(0)
  sortOrder?: number;

  @ApiPropertyOptional({ description: 'Archiving the default wallet is refused (8.14)' })
  @IsOptional()
  @IsBoolean()
  isArchived?: boolean;

  @ApiPropertyOptional({ description: 'Only true is meaningful; a user always has one default' })
  @IsOptional()
  @IsBoolean()
  isDefault?: boolean;
}
