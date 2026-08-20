import { Controller, Get, Post, Body, Req } from '@nestjs/common';
import { SubscriptionsService } from './subscriptions.service';
import { UpdateSubscriptionDto, UpdateSubscriptionDtoSchema } from './dto/update-subscription.dto';
import { ZodValidationPipe } from '../../common/pipes/zod-validation.pipe';

@Controller('subscriptions')
export class SubscriptionsController {
  constructor(private readonly subscriptionsService: SubscriptionsService) {}

  /** The plan catalogue. Each plan carries the entitlements it grants. */
  @Get('plans')
  async getPlans() {
    return this.subscriptionsService.getPlans();
  }

  /** The subscription row (may be `null`) together with the entitlements it resolves to. */
  @Get('me')
  async getMySubscription(@Req() req: any) {
    return this.subscriptionsService.getMySubscription(req.user.id);
  }

  /**
   * What this user is allowed to do. The client gates UI on this rather than on
   * tier names, so legacy tiers and future tiers need no client release.
   */
  @Get('entitlements')
  async getEntitlements(@Req() req: any) {
    return this.subscriptionsService.getEntitlements(req.user.id);
  }

  /** Mock purchase — no payment provider is integrated yet. */
  @Post('upgrade')
  async upgradeSubscription(
    @Req() req: any,
    @Body(new ZodValidationPipe(UpdateSubscriptionDtoSchema)) body: UpdateSubscriptionDto,
  ) {
    return this.subscriptionsService.upgradeSubscription(req.user.id, body.planId);
  }
}
