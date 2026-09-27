import { ApiProperty } from '@nestjs/swagger';
import { IsIn } from 'class-validator';
import { SCAN_PROVIDERS, ScanProvider } from '../scan.types';

export class ScanReceiptDto {
  @ApiProperty({ enum: SCAN_PROVIDERS, description: 'Which app the receipt screenshot is from' })
  @IsIn(SCAN_PROVIDERS, { message: `provider must be one of ${SCAN_PROVIDERS.join(', ')}` })
  provider!: ScanProvider;
}
