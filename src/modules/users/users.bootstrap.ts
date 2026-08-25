import { Injectable, Logger, OnApplicationBootstrap } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Env } from '@/config/env.schema';
import { UsersService } from './users.service';

/**
 * Creates the seed user described by SEED_USER_* on first boot (PRD 7.4).
 *
 * It only fires when the users table is empty, so restarting a running deployment can
 * never resurrect or overwrite an account.
 */
@Injectable()
export class UsersBootstrap implements OnApplicationBootstrap {
  private readonly logger = new Logger(UsersBootstrap.name);

  constructor(
    private readonly users: UsersService,
    private readonly config: ConfigService<Env, true>,
  ) {}

  async onApplicationBootstrap(): Promise<void> {
    const email = this.config.get('SEED_USER_EMAIL', { infer: true });
    const password = this.config.get('SEED_USER_PASSWORD', { infer: true });
    const displayName = this.config.get('SEED_USER_NAME', { infer: true });

    if (!email || !password) return;

    const existing = await this.users.count();
    if (existing > 0) {
      this.logger.log('Users already exist, skipping seed user bootstrap');
      return;
    }

    await this.users.createUser({
      email,
      password,
      displayName: displayName && displayName.length > 0 ? displayName : email.split('@')[0],
    });

    this.logger.log(`Seeded initial user ${email} with default categories`);
  }
}
