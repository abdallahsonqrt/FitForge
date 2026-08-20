import { Controller, Get, Post, Body, Param, ParseUUIDPipe, Req } from '@nestjs/common';
import { PlansService } from './plans.service';
import { CreatePlanDto, createPlanSchema } from './dto/create-plan.dto';
import { ZodValidationPipe } from '../../common/pipes/zod-validation.pipe';
import { Roles } from '../../common/decorators/roles.decorator';
import { SubscriptionsService } from '../subscriptions/subscriptions.service';
import { FREE_ENTITLEMENTS } from '../subscriptions/entitlements';

/**
 * `/plans` — the athlete's read-only view of the catalogue.
 *
 * This controller predates the coach model and writes to the same table
 * `/coaches/me/programs` now owns. Rather than delete the overlap, the two are
 * split by direction: everything an athlete does with a plan (browse it, open
 * the one they train on) stays here and is read-only, and every write to a coach
 * program goes through the builder, where ownership is derived from the token.
 * The one write left here is `POST`, kept because the platform's own catalogue
 * rows belong to nobody and so cannot be authored through a coach route — and it
 * is now `@Roles('admin')`, which is what it always should have been.
 *
 * Both reads resolve entitlements and visibility server-side. Before this, `GET
 * /plans` filtered on tier but not visibility (so coach drafts appeared in the
 * athlete catalogue) and `GET /plans/:id` filtered on neither (so any signed-in
 * user could fetch any draft of any tier in full).
 */
@Controller('plans')
export class PlansController {
  constructor(
    private readonly plansService: PlansService,
    private readonly subscriptions: SubscriptionsService,
  ) {}

  /**
   * The catalogue this user can open. The tier used to arrive as a query
   * parameter, which meant the client chose its own entitlements; it is now
   * resolved from the caller's subscription.
   */
  @Get()
  async getPlans(@Req() req: any) {
    const entitlements = req.user
      ? await this.subscriptions.getEntitlements(req.user.id)
      : FREE_ENTITLEMENTS;

    return this.plansService.findAll(entitlements, req.user?.id ?? null);
  }

  /**
   * `id` is a plan uuid. Validated here rather than in the service so a client
   * typo is answered with a 400 instead of reaching Postgres and coming back as
   * a 500 — a bad link is a client error, not a server fault.
   */
  @Get(':id')
  async getPlan(@Param('id', ParseUUIDPipe) id: string, @Req() req: any) {
    const entitlements = req.user
      ? await this.subscriptions.getEntitlements(req.user.id)
      : FREE_ENTITLEMENTS;

    return this.plansService.findOne(id, { userId: req.user?.id ?? null, entitlements });
  }

  /**
   * Platform catalogue authoring.
   *
   * Admin-only: this used to be open to any authenticated user with the tier
   * taken from the body, which let an athlete mint an unowned `elite` plan.
   */
  @Post()
  @Roles('admin')
  async createPlan(@Body(new ZodValidationPipe(createPlanSchema)) body: CreatePlanDto) {
    return this.plansService.create(body);
  }
}
