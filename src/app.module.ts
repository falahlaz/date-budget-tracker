import { Module } from '@nestjs/common';
import { ServeStaticModule } from '@nestjs/serve-static';
import { join } from 'node:path';
import { ConfigModule } from './config/config.module';
import { PrismaModule } from './prisma/prisma.module';
import { AuthModule } from './modules/auth/auth.module';
import { HealthModule } from './modules/health/health.module';
import { UsersModule } from './modules/users/users.module';

@Module({
  imports: [
    ConfigModule,
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
    HealthModule,
  ],
})
export class AppModule {}
