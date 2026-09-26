import { ApiPropertyOptional, PartialType } from '@nestjs/swagger';
import { IsBoolean, IsOptional } from 'class-validator';
import { CreateBillDto } from './create-bill.dto';

export class UpdateBillDto extends PartialType(CreateBillDto) {
  @ApiPropertyOptional({ description: 'Archive or restore the bill' })
  @IsOptional()
  @IsBoolean()
  isArchived?: boolean;
}
