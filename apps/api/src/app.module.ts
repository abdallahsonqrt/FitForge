import { Module } from '@nestjs/common';
import { APP_GUARD } from '@nestjs/core';
import { ConfigModule } from '@nestjs/config';
import { validateEnv } from './config/env';
import { ScheduleModule } from '@nestjs/schedule';
import { ThrottlerModule } from '@nestjs/throttler';
import { DatabaseModule } from './database/database.module';
import { StorageModule } from './storage';
import { JwtAuthGuard } from './common/guards/jwt-auth.guard';
import { RolesGuard } from './common/guards/roles.guard';
import { AuthModule } from './modules/auth/auth.module';
import { UsersModule } from './modules/users/users.module';
import { TrainingModule } from './modules/training/training.module';
import { CoachesModule } from './modules/coaches/coaches.module';
import { EnrollmentsModule } from './modules/enrollments/enrollments.module';
import { MessagingModule } from './modules/messaging/messaging.module';
import { ExerciseMediaModule } from './modules/exercise-media/exercise-media.module';
import { NutritionModule } from './modules/nutrition/nutrition.module';
import { FoodModule } from './modules/food/food.module';
import { AiLoggerModule } from './modules/ai-logger/ai-logger.module';
import { ProgressModule } from './modules/progress/progress.module';
import { StreaksModule } from './modules/streaks/streaks.module';
import { NotificationsModule } from './modules/notifications/notifications.module';
import { SubscriptionsModule } from './modules/subscriptions/subscriptions.module';
import { DevicesModule } from './modules/devices/devices.module';
import { AdminModule } from './modules/admin/admin.module';

@Module({
  imports: [
    ConfigModule.forRoot({
      isGlobal: true,
      validate: validateEnv,
    }),
    ScheduleModule.forRoot(),
    // Registered here, applied nowhere by default: `ThrottlerGuard` is opted into
    // per controller (currently only `AuthController`, which overrides these
    // numbers per route). Making it an APP_GUARD would put a request budget on
    // every endpoint in the product, which is a separate decision from closing
    // the brute-force hole on sign-in.
    ThrottlerModule.forRoot([{ ttl: 60_000, limit: 120 }]),
    DatabaseModule,
    StorageModule,
    AuthModule,
    UsersModule,
    TrainingModule,
    // The coach-centric domain. CoachesModule is listed first because it exports
    // the access checks the two below it gate on.
    CoachesModule,
    EnrollmentsModule,
    MessagingModule,
    ExerciseMediaModule,
    NutritionModule,
    FoodModule,
    AiLoggerModule,
    ProgressModule,
    StreaksModule,
    NotificationsModule,
    SubscriptionsModule,
    DevicesModule,
    AdminModule,
  ],
  providers: [
    {
      provide: APP_GUARD,
      useClass: JwtAuthGuard,
    },
    {
      // Order matters: guards run in registration order, so authentication has
      // already attached `request.user` by the time roles are checked.
      provide: APP_GUARD,
      useClass: RolesGuard,
    },
  ],
})
export class AppModule {}
