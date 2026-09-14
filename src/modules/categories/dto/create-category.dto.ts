import { ApiPropertyOptional, ApiProperty } from '@nestjs/swagger';
import { WalletType } from '@prisma/client';
import { IsEnum, IsHexColor, IsOptional, IsString, Length, MaxLength } from 'class-validator';

export class CreateCategoryDto {
  /**
   * Which vocabulary this belongs to (PRD v2 9.4). Spending categories and withdrawal
   * categories are separate lists, and the same name may exist in both.
   */
  @ApiPropertyOptional({ enum: WalletType, default: WalletType.DATE_BUDGET })
  @IsOptional()
  @IsEnum(WalletType, { message: 'walletType must be DATE_BUDGET or SAVINGS' })
  walletType?: WalletType;

  @ApiProperty({ maxLength: 50, example: 'Makan' })
  @IsString()
  @Length(1, 50, { message: 'name must be between 1 and 50 characters' })
  name!: string;

  @ApiPropertyOptional({ example: '#EF4444', description: 'Hex colour used in the charts' })
  @IsOptional()
  @IsHexColor({ message: 'color must be a hex colour such as #EF4444' })
  @Length(7, 7, { message: 'color must be 7 characters including the leading #' })
  color?: string;

  @ApiPropertyOptional({ example: 'utensils', description: 'lucide-react icon name' })
  @IsOptional()
  @IsString()
  @MaxLength(40)
  icon?: string;
}
