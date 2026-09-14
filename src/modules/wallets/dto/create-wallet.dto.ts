import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { WalletType } from '@prisma/client';
import { Type } from 'class-transformer';
import { IsEnum, IsInt, IsOptional, IsString, Matches, MaxLength, Min, MinLength } from 'class-validator';

export class CreateWalletDto {
  @ApiProperty({ maxLength: 60, example: 'Tabungan' })
  @IsString()
  @MinLength(1, { message: 'name must not be empty' })
  @MaxLength(60, { message: 'name must be at most 60 characters' })
  name!: string;

  /** Immutable once set: the type is which engine reads the wallet's rows. */
  @ApiProperty({ enum: WalletType })
  @IsEnum(WalletType, { message: 'type must be DATE_BUDGET or SAVINGS' })
  type!: WalletType;

  @ApiPropertyOptional({ example: '#3E8C74', description: 'Identity colour in the switcher' })
  @IsOptional()
  @Matches(/^#[0-9A-Fa-f]{6}$/, { message: 'color must be a #RRGGBB hex value' })
  color?: string;

  @ApiPropertyOptional({ maxLength: 40, description: 'lucide-react icon name' })
  @IsOptional()
  @IsString()
  @MaxLength(40)
  icon?: string;

  @ApiPropertyOptional({ description: 'Defaults to the end of the list' })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(0)
  sortOrder?: number;
}
