import { Module } from '@nestjs/common';
import { UsersBootstrap } from './users.bootstrap';
import { UsersService } from './users.service';

@Module({
  providers: [UsersService, UsersBootstrap],
  exports: [UsersService],
})
export class UsersModule {}
