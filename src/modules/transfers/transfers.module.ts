import { Module } from '@nestjs/common';
import { PrismaModule } from '@/prisma/prisma.module';
import { BudgetsModule } from '../budgets/budgets.module';
import { SavingsModule } from '../savings/savings.module';
import { WalletsCoreModule } from '../wallets/wallets-core.module';
import { TransfersController } from './transfers.controller';
import { TransfersService } from './transfers.service';

@Module({
  imports: [PrismaModule, WalletsCoreModule, BudgetsModule, SavingsModule],
  controllers: [TransfersController],
  providers: [TransfersService],
})
export class TransfersModule {}
