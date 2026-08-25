import { ApiPropertyOptional, ApiProperty } from '@nestjs/swagger';
import { IsHexColor, IsOptional, IsString, Length, MaxLength } from 'class-validator';

export class CreateCategoryDto {
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
