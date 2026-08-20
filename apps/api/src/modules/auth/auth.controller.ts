import {
  Controller,
  Post,
  Body,
  Req,
  Res,
  HttpCode,
  HttpStatus,
  Ip,
  UnauthorizedException,
  UseGuards,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Throttle, ThrottlerGuard } from '@nestjs/throttler';
import { AuthService, SessionContext } from './auth.service';
import { LoginDto } from './dto/login.dto';
import { RegisterDto } from './dto/register.dto';
import { RefreshTokenDto } from './dto/refresh-token.dto';
import { ForgotPasswordDto, ResetPasswordDto } from './dto/password-reset.dto';
import { Request, Response } from 'express';
import { Public } from '../../common/decorators/public.decorator';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { throttleFor } from './auth.throttle';
import {
  RefreshCookiePolicy,
  clearRefreshCookie,
  isBrowserClient,
  readRefreshCookie,
  resolveRefreshCookiePolicy,
  setRefreshCookie,
} from './auth.cookies';

/**
 * Per-IP ceilings live in `auth.throttle.ts` and are configurable — one office
 * or a carrier-grade NAT is a single bucket, and `TRUST_PROXY` defaults to
 * `false`, so the address these count against is often thousands of people. The
 * decorators pass thunks rather than literals because they are evaluated before
 * `ConfigModule` has loaded `.env`; see that file.
 */
type TokenPair = { accessToken: string; refreshToken: string };

/** What a browser receives: the refresh token reaches it as a cookie instead. */
type AccessTokenOnly = Omit<TokenPair, 'refreshToken'>;

@Controller('auth')
@UseGuards(ThrottlerGuard)
export class AuthController {
  private readonly cookiePolicy: RefreshCookiePolicy;

  constructor(
    private readonly authService: AuthService,
    configService: ConfigService,
  ) {
    this.cookiePolicy = resolveRefreshCookiePolicy(configService);
  }

  @Public()
  @Post('register')
  @Throttle(throttleFor('register'))
  async register(
    @Body() registerDto: RegisterDto,
    @Req() req: Request,
    @Res({ passthrough: true }) res: Response,
    @Ip() ip: string,
  ) {
    // Registration signs the account in, so it needs the same client details as
    // login — without them the new session has no device to attach to.
    const tokens = await this.authService.register(registerDto, sessionContext(registerDto, req, ip));
    return this.deliver(req, res, tokens);
  }

  @Public()
  @Post('login')
  @Throttle(throttleFor('login'))
  @HttpCode(HttpStatus.OK)
  async login(
    @Body() loginDto: LoginDto,
    @Req() req: Request,
    @Res({ passthrough: true }) res: Response,
    @Ip() ip: string,
  ) {
    const tokens = await this.authService.login(loginDto, sessionContext(loginDto, req, ip));
    return this.deliver(req, res, tokens);
  }

  @Public()
  @Post('refresh')
  @Throttle(throttleFor('refresh'))
  @HttpCode(HttpStatus.OK)
  async refresh(
    @Body() refreshTokenDto: RefreshTokenDto,
    @Req() req: Request,
    @Res({ passthrough: true }) res: Response,
  ) {
    const presented = refreshTokenDto.refreshToken ?? readRefreshCookie(req);
    if (!presented) {
      // The same answer as a token that fails to verify: whether the caller sent
      // nothing or sent rubbish is not information worth handing out.
      throw new UnauthorizedException('Invalid refresh token');
    }

    const tokens = await this.authService.refresh(presented);
    return this.deliver(req, res, tokens);
  }

  @Post('logout')
  @HttpCode(HttpStatus.OK)
  async logout(
    @CurrentUser() user: { id: string; sid?: string },
    @Body() refreshTokenDto: RefreshTokenDto,
    @Req() req: Request,
    @Res({ passthrough: true }) res: Response,
  ) {
    // Scoped to the caller: the token says which session to end, the access
    // token says whose sessions may be ended. With neither body nor cookie we
    // fall back to `sid` — the session the access token itself belongs to, which
    // by construction is the caller's own.
    const presented = refreshTokenDto.refreshToken ?? readRefreshCookie(req);
    const result = await this.authService.logout(user.id, presented, user.sid);
    clearRefreshCookie(res, this.cookiePolicy);
    return result;
  }

  /**
   * Ask for a reset link.
   *
   * Always 202, whether or not the address has an account. A 404 for unknown
   * addresses would let anyone test which emails are registered here, and the
   * throttle budget is shared with `login` because both take an address and a
   * guess about whether it exists.
   */
  @Public()
  @Post('forgot-password')
  @HttpCode(HttpStatus.ACCEPTED)
  @Throttle(throttleFor('login'))
  async forgotPassword(@Body() dto: ForgotPasswordDto) {
    await this.authService.forgotPassword(dto.email);
    return {
      message: 'If an account exists for that address, a reset link is on its way.',
    };
  }

  /**
   * Redeem a reset link.
   *
   * On success every session for the account is gone, including any the caller
   * held, so the client sends the user back to sign-in rather than trying to
   * reuse tokens it may still be holding.
   */
  @Public()
  @Post('reset-password')
  @HttpCode(HttpStatus.OK)
  @Throttle(throttleFor('login'))
  async resetPassword(
    @Body() dto: ResetPasswordDto,
    @Res({ passthrough: true }) res: Response,
  ) {
    await this.authService.resetPassword(dto.token, dto.password);
    // The browser's refresh cookie names a session that no longer exists.
    clearRefreshCookie(res, this.cookiePolicy);
    return { message: 'Your password has been changed. Please sign in again.' };
  }

  /**
   * Hands the pair back the way the caller can use it.
   *
   * Browsers get the refresh token *only* as an `HttpOnly` cookie, which page
   * JavaScript cannot read. Returning it in the body as well would hand it
   * straight back to the scripts the cookie exists to keep it away from, which
   * would defeat the entire point of setting one.
   *
   * Native clients have no cookie jar in this app, so the body remains their
   * only channel and is unchanged — see `auth.cookies.ts` for how the two are
   * told apart.
   */
  private deliver(req: Request, res: Response, tokens: TokenPair): TokenPair | AccessTokenOnly {
    setRefreshCookie(req, res, tokens.refreshToken, this.cookiePolicy);

    if (isBrowserClient(req)) {
      const { refreshToken: _inCookieInstead, ...rest } = tokens;
      return rest;
    }

    return tokens;
  }
}

const sessionContext = (
  dto: LoginDto | RegisterDto,
  req: Request,
  ip: string,
): SessionContext => ({
  userAgent: req.headers['user-agent'] || '',
  ip,
  deviceId: dto.deviceId,
  deviceName: dto.deviceName,
  platform: dto.platform,
});
