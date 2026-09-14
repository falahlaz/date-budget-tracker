import { Module } from '@nestjs/common';
import { ServeStaticModule } from '@nestjs/serve-static';
import { join, sep } from 'node:path';
import { ClockModule } from './common/clock/clock.module';
import { ConfigModule } from './config/config.module';
import { PrismaModule } from './prisma/prisma.module';
import { AuthModule } from './modules/auth/auth.module';
import { BudgetsModule } from './modules/budgets/budgets.module';
import { CategoriesModule } from './modules/categories/categories.module';
import { TransactionsModule } from './modules/transactions/transactions.module';
import { ReceiptsModule } from './modules/receipts/receipts.module';
import { ReportsModule } from './modules/reports/reports.module';
import { HealthModule } from './modules/health/health.module';
import { UsersModule } from './modules/users/users.module';
import { WalletsModule } from './modules/wallets/wallets.module';

@Module({
  imports: [
    ConfigModule,
    ClockModule,
    PrismaModule,
    // The built SPA lives next to the compiled server output. Anything under /api is
    // excluded so the static handler never shadows a controller; everything else falls
    // back to index.html so deep links like /month or /expenses/12 survive a refresh.
    ServeStaticModule.forRoot({
      rootPath: join(__dirname, '..', 'client', 'dist'),
      exclude: ['/api/{*splat}'],
      serveStaticOptions: {
        index: 'index.html',
        fallthrough: true,
        // Vite fingerprints everything under /assets, so those files can never change
        // behind a given URL and are safe to cache for a year. index.html carries the
        // pointers to them, so it must always be revalidated or a deploy never lands.
        setHeaders: (response, path) => {
          const immutable = path.includes(`${sep}assets${sep}`);
          response.setHeader(
            'Cache-Control',
            immutable ? 'public, max-age=31536000, immutable' : 'no-cache',
          );
        },
      },
    }),
    AuthModule,
    UsersModule,
    CategoriesModule,
    WalletsModule,
    BudgetsModule,
    TransactionsModule,
    ReceiptsModule,
    ReportsModule,
    HealthModule,
  ],
})
export class AppModule {}
