import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { JwtService } from '@nestjs/jwt';
import { User } from '@prisma/client';
import { createHash, randomBytes } from 'node:crypto';
import { AuthenticatedUser } from '@/common/decorators/current-user.decorator';
import { AppException } from '@/common/errors';
import { parseDurationSeconds } from '@/common/utils/duration';
import { Env } from '@/config/env.schema';
import { PrismaService } from '@/prisma/prisma.service';
import { UsersService } from '../users/users.service';

export interface AccessTokenPayload {
  sub: number;
  email: string;
}

export interface LoginResult {
  accessToken: string;
  expiresIn: number;
  refreshToken: string;
  user: AuthenticatedUser;
}

/** Refresh tokens are stored only as a SHA-256 digest, never in the clear (PRD 8.2). */
function hashToken(rawToken: string): string {
  return createHash('sha256').update(rawToken).digest('hex');
}

@Injectable()
export class AuthService {
  private readonly logger = new Logger(AuthService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly users: UsersService,
    private readonly jwt: JwtService,
    private readonly config: ConfigService<Env, true>,
  ) {}

  get accessTokenTtlSeconds(): number {
    return parseDurationSeconds(this.config.get('JWT_ACCESS_TTL', { infer: true }));
  }

  get refreshTtlDays(): number {
    return this.config.get('REFRESH_TTL_DAYS', { infer: true });
  }

  /**
   * Verifies credentials.
   *
   * An unknown email and a wrong password fail identically so the endpoint cannot be used
   * to enumerate accounts.
   */
  async validateCredentials(email: string, password: string): Promise<User> {
    const user = await this.users.findByEmail(email);

    if (!user || !(await this.users.verifyPassword(user.passwordHash, password))) {
      throw AppException.unauthorized('email or password is incorrect');
    }

    return user;
  }

  async login(email: string, password: string, userAgent?: string): Promise<LoginResult> {
    const user = await this.validateCredentials(email, password);
    return this.issueSession(user, userAgent);
  }

  /**
   * Exchanges a refresh token for a new session and revokes the old token immediately
   * (rotation on every refresh, PRD 8.2).
   */
  async refresh(rawToken: string | undefined, userAgent?: string): Promise<LoginResult> {
    if (!rawToken) {
      throw AppException.unauthorized('refresh token is missing');
    }

    const stored = await this.prisma.refreshToken.findUnique({
      where: { tokenHash: hashToken(rawToken) },
      include: { user: true },
    });

    if (!stored || stored.revokedAt !== null || stored.expiresAt <= new Date()) {
      throw AppException.unauthorized('refresh token is invalid or expired');
    }

    await this.prisma.refreshToken.update({
      where: { id: stored.id },
      data: { revokedAt: new Date() },
    });

    return this.issueSession(stored.user, userAgent);
  }

  async logout(rawToken: string | undefined): Promise<void> {
    if (!rawToken) return;

    await this.prisma.refreshToken.updateMany({
      where: { tokenHash: hashToken(rawToken), revokedAt: null },
      data: { revokedAt: new Date() },
    });
  }

  /**
   * Changes the password and revokes every refresh token, so any other signed-in device
   * is logged out (PRD 8.2).
   */
  async changePassword(userId: number, currentPassword: string, newPassword: string): Promise<void> {
    const user = await this.users.findById(userId);

    if (!user || !(await this.users.verifyPassword(user.passwordHash, currentPassword))) {
      throw AppException.unauthorized('current password is incorrect');
    }

    await this.prisma.$transaction(async (tx) => {
      await tx.user.update({
        where: { id: userId },
        data: { passwordHash: await this.users.hashPassword(newPassword) },
      });
      await tx.refreshToken.updateMany({
        where: { userId, revokedAt: null },
        data: { revokedAt: new Date() },
      });
    });
  }

  private async issueSession(user: User, userAgent?: string): Promise<LoginResult> {
    const payload: AccessTokenPayload = { sub: user.id, email: user.email };
    const expiresIn = this.accessTokenTtlSeconds;

    const rawRefreshToken = randomBytes(32).toString('hex');
    const expiresAt = new Date(Date.now() + this.refreshTtlDays * 86_400_000);

    await this.prisma.refreshToken.create({
      data: {
        userId: user.id,
        tokenHash: hashToken(rawRefreshToken),
        expiresAt,
        userAgent: userAgent?.slice(0, 255) ?? null,
      },
    });

    return {
      accessToken: await this.jwt.signAsync(payload, { expiresIn }),
      expiresIn,
      refreshToken: rawRefreshToken,
      user: { id: user.id, email: user.email, displayName: user.displayName },
    };
  }
}
