import { Module } from '@nestjs/common';
import { SavingsModule } from '../savings/savings.module';
import { TransactionsModule } from '../transactions/transactions.module';
import { WalletsCoreModule } from '../wallets/wallets-core.module';
import { BillsController } from './bills.controller';
import { BillsService } from './bills.service';

/**
 * Bills sit on top of both engines: paying one goes through the transactions door for a
 * date-budget wallet and the savings door for a savings one.
 */
@Module({
  imports: [WalletsCoreModule, TransactionsModule, SavingsModule],
  controllers: [BillsController],
  providers: [BillsService],
})
export class BillsModule {}
