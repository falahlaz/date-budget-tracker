import {
  Body,
  Controller,
  Get,
  HttpCode,
  HttpStatus,
  Post,
  Req,
  Res,
  UseGuards,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Throttle } from '@nestjs/throttler';
import { ApiOperation, ApiTags } from '@nestjs/swagger';
import { CookieOptions, Request, Response } from 'express';
import { AuthenticatedUser, CurrentUser } from '@/common/decorators/current-user.decorator';
import { Public } from '@/common/decorators/public.decorator';
import { Env } from '@/config/env.schema';
import { AuthService, LoginResult } from './auth.service';
import { ChangePasswordDto } from './dto/change-password.dto';
import { LoginDto } from './dto/login.dto';
import {
  LOGIN_THROTTLER,
  LOGIN_THROTTLE_LIMIT,
  LOGIN_THROTTLE_TTL_MS,
  LoginThrottlerGuard,
} from './guards/login-throttler.guard';

export const REFRESH_COOKIE = 'refresh_token';

@ApiTags('auth')
@Controller('auth')
export class AuthController {
  constructor(
    private readonly auth: AuthService,
    private readonly config: ConfigService<Env, true>,
  ) {}

  @Public()
  @UseGuards(LoginThrottlerGuard)
  @Throttle({ [LOGIN_THROTTLER]: { limit: LOGIN_THROTTLE_LIMIT, ttl: LOGIN_THROTTLE_TTL_MS } })
  @Post('login')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Exchange credentials for an access token and refresh cookie' })
  async login(
    @Body() dto: LoginDto,
    @Req() request: Request,
    @Res({ passthrough: true }) response: Response,
  ) {
    const result = await this.auth.login(dto.email, dto.password, request.get('user-agent'));
    return this.respondWithSession(result, response);
  }

  @Public()
  @Post('refresh')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Rotate the refresh cookie and issue a fresh access token' })
  async refresh(@Req() request: Request, @Res({ passthrough: true }) response: Response) {
    const result = await this.auth.refresh(
      request.cookies?.[REFRESH_COOKIE] as string | undefined,
      request.get('user-agent'),
    );

    const { user: _user, ...session } = this.respondWithSession(result, response);
    // Refresh only renews the session; it does not re-send the profile (PRD 8.2).
    return session;
  }

  @Post('logout')
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiOperation({ summary: 'Revoke the refresh token and clear the cookie' })
  async logout(@Req() request: Request, @Res({ passthrough: true }) response: Response) {
    await this.auth.logout(request.cookies?.[REFRESH_COOKIE] as string | undefined);
    response.clearCookie(REFRESH_COOKIE, this.cookieOptions());
  }

  @Get('me')
  @ApiOperation({ summary: 'The signed-in user' })
  me(@CurrentUser() user: AuthenticatedUser): AuthenticatedUser {
    return user;
  }

  @Post('change-password')
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiOperation({ summary: 'Change the password and sign out every other session' })
  async changePassword(
    @CurrentUser('id') userId: number,
    @Body() dto: ChangePasswordDto,
    @Res({ passthrough: true }) response: Response,
  ): Promise<void> {
    await this.auth.changePassword(userId, dto.currentPassword, dto.newPassword);
    response.clearCookie(REFRESH_COOKIE, this.cookieOptions());
  }

  private respondWithSession(result: LoginResult, response: Response) {
    response.cookie(REFRESH_COOKIE, result.refreshToken, {
      ...this.cookieOptions(),
      maxAge: this.auth.refreshTtlDays * 86_400_000,
    });

    return {
      accessToken: result.accessToken,
      expiresIn: result.expiresIn,
      user: result.user,
    };
  }

  /**
   * The refresh token is httpOnly so no script can read it, and scoped to /api/auth so it
   * is only ever sent to the two endpoints that consume it.
   *
   * Secure defaults to on in production but stays overridable, because it is a property of
   * how the app is *served*, not of NODE_ENV: a production build reached over plain HTTP
   * (a LAN deploy with no TLS terminator) would have this cookie silently dropped by the
   * browser, and the only visible symptom is that every reload lands back on /login.
   */
  private cookieOptions(): CookieOptions {
    const explicitSecure = this.config.get('COOKIE_SECURE', { infer: true });

    return {
      httpOnly: true,
      sameSite: 'lax',
      secure: explicitSecure ?? this.config.get('NODE_ENV', { infer: true }) === 'production',
      path: '/api/auth',
    };
  }
}
