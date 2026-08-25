import { Module } from '@nestjs/common';
import { ConfigModule } from '@/config/config.module';
import { PrismaModule } from '@/prisma/prisma.module';
import { UsersService } from '@/modules/users/users.service';

/**
 * A deliberately minimal context for CLI commands: config, database and UsersService only.
 *
 * It leaves out the HTTP layer and the boot-time seed, so running a command can never
 * start a server or trigger the empty-database bootstrap as a side effect.
 */
@Module({
  imports: [ConfigModule, PrismaModule],
  providers: [UsersService],
})
export class CliModule {}
