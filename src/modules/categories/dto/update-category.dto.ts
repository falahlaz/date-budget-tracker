import { ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import { IsBoolean, IsHexColor, IsInt, IsOptional, IsString, Length, Max, MaxLength, Min } from 'class-validator';

export class UpdateCategoryDto {
  @ApiPropertyOptional({ maxLength: 50 })
  @IsOptional()
  @IsString()
  @Length(1, 50)
  name?: string;

  @ApiPropertyOptional({ example: '#EF4444' })
  @IsOptional()
  @IsHexColor()
  @Length(7, 7)
  color?: string;

  @ApiPropertyOptional({ example: 'utensils' })
  @IsOptional()
  @IsString()
  @MaxLength(40)
  icon?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(-32768)
  @Max(32767)
  sortOrder?: number;

  @ApiPropertyOptional()
  @IsOptional()
  @IsBoolean()
  isArchived?: boolean;
}
