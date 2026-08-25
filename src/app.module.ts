import { Module } from '@nestjs/common';
import { ServeStaticModule } from '@nestjs/serve-static';
import { join } from 'node:path';
import { ClockModule } from './common/clock/clock.module';
import { ConfigModule } from './config/config.module';
import { PrismaModule } from './prisma/prisma.module';
import { AuthModule } from './modules/auth/auth.module';
import { BudgetsModule } from './modules/budgets/budgets.module';
import { CategoriesModule } from './modules/categories/categories.module';
import { HealthModule } from './modules/health/health.module';
import { UsersModule } from './modules/users/users.module';

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
      },
    }),
    AuthModule,
    UsersModule,
    CategoriesModule,
    BudgetsModule,
    HealthModule,
  ],
})
export class AppModule {}
