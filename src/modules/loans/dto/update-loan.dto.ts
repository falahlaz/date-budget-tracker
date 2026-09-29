import { OmitType, PartialType } from '@nestjs/swagger';
import { CreateLoanDto } from './create-loan.dto';

/**
 * Everything but the wallet. Moving a loan to another wallet would move money that may
 * already have been partly paid back somewhere else; delete and re-record it instead.
 */
export class UpdateLoanDto extends PartialType(OmitType(CreateLoanDto, ['walletId'] as const)) {}
