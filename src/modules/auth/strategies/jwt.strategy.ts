import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { PassportStrategy } from '@nestjs/passport';
import { ExtractJwt, Strategy } from 'passport-jwt';
import { AuthenticatedUser } from '@/common/decorators/current-user.decorator';
import { AppException } from '@/common/errors';
import { Env } from '@/config/env.schema';
import { UsersService } from '@/modules/users/users.service';
import { AccessTokenPayload } from '../auth.service';

@Injectable()
export class JwtStrategy extends PassportStrategy(Strategy) {
  constructor(
    config: ConfigService<Env, true>,
    private readonly users: UsersService,
  ) {
    super({
      jwtFromRequest: ExtractJwt.fromAuthHeaderAsBearerToken(),
      ignoreExpiration: false,
      secretOrKey: config.get('JWT_SECRET', { infer: true }),
    });
  }

  /**
   * Re-reads the user on every request so a deleted account cannot keep using a token
   * that has not expired yet.
   */
  async validate(payload: AccessTokenPayload): Promise<AuthenticatedUser> {
    const user = await this.users.findById(payload.sub);

    if (!user) {
      throw AppException.unauthorized('account no longer exists');
    }

    return { id: user.id, email: user.email, displayName: user.displayName };
  }
}
