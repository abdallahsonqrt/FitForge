import { Module } from '@nestjs/common';
import { JwtModule } from '@nestjs/jwt';
import { PassportModule } from '@nestjs/passport';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { AuthService } from './auth.service';
import { AuthController } from './auth.controller';
import { JwtStrategy } from './strategies/jwt.strategy';
import { LoginThrottleService } from './login-throttle.service';
import { PasswordResetDelivery } from './password-reset.delivery';
import { SubscriptionsModule } from '../subscriptions/subscriptions.module';

@Module({
  imports: [
    PassportModule,
    // For `entitlements.deviceLimit`: how many devices an account may hold is a
    // plan entitlement, and signing in has to honour the same number the devices
    // module and the paywall quote. SubscriptionsModule depends on nothing here,
    // so this does not create a cycle.
    SubscriptionsModule,
    JwtModule.registerAsync({
      imports: [ConfigModule],
      useFactory: async (configService: ConfigService) => ({
        // The module default is the *access* secret, and only access tokens are
        // signed with it. Refresh tokens pass `JWT_REFRESH_SECRET` explicitly at
        // sign and verify time (see `AuthService`), which is what stops a refresh
        // token from authenticating a protected endpoint.
        //
        // `getOrThrow`, not `get(...) || 'fallback_secret'`: an unset secret used
        // to be silently replaced by a constant published in this repository,
        // making every token in that deployment forgeable. Now it fails at boot.
        secret: configService.getOrThrow<string>('JWT_SECRET'),
      }),
      inject: [ConfigService],
    }),
  ],
  controllers: [AuthController],
  providers: [AuthService, JwtStrategy, LoginThrottleService, PasswordResetDelivery],
  exports: [AuthService],
})
export class AuthModule {}
