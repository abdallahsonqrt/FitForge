import {
  Injectable,
  Inject,
  BadRequestException,
  NotFoundException,
  ForbiddenException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { NodePgDatabase } from 'drizzle-orm/node-postgres';
import { eq } from 'drizzle-orm';
import * as schema from '../../database/schema';
import {
  entitlementsForPlan,
  entitlementsForSubscription,
  tierRank,
  type Entitlements,
} from './entitlements';

@Injectable()
export class SubscriptionsService {
  constructor(
    @Inject('DB_CONNECTION') private readonly db: NodePgDatabase<typeof schema>,
    private readonly config: ConfigService,
  ) {}

  /**
   * Whether the mock purchase path may run. Explicit opt-in in production, on by
   * default everywhere else so local and demo environments are unchanged.
   */
  private get unpaidUpgradesAllowed(): boolean {
    const configured = this.config.get<boolean>('ALLOW_UNPAID_UPGRADES');
    if (typeof configured === 'boolean') return configured;
    return this.config.get<string>('NODE_ENV') !== 'production';
  }

  /**
   * The plan catalogue, cheapest first, each with the entitlements it grants so
   * the paywall can describe the coach service without re-deriving the rules.
   */
  async getPlans() {
    const plans = await this.db.query.subscriptionPlans.findMany();

    return plans
      .sort((a, b) => a.priceCents - b.priceCents)
      .map((plan) => ({ ...plan, entitlements: entitlementsForPlan(plan) }));
  }

  async getUserSubscription(userId: string) {
    const [sub] = await this.db.query.userSubscriptions.findMany({
      where: eq(schema.userSubscriptions.userId, userId),
      with: {
        plan: true,
      },
      limit: 1,
    });
    return sub || null;
  }

  /**
   * The entitlements resolver: the one way to ask what a user is allowed to do.
   *
   * Callers must not compare tier strings themselves — a user on the legacy
   * `elite` tier gets Coach entitlements only because this passes through the
   * bridge in `entitlements.ts`.
   */
  async getEntitlements(userId: string): Promise<Entitlements> {
    return entitlementsForSubscription(await this.getUserSubscription(userId));
  }

  /** `GET /subscriptions/me` — the subscription row plus its resolved entitlements. */
  async getMySubscription(userId: string) {
    const subscription = await this.getUserSubscription(userId);
    return { subscription, entitlements: entitlementsForSubscription(subscription) };
  }

  /**
   * Mock purchase path — no payment provider is wired up yet, so selecting a
   * plan simply moves the subscription row. Real billing replaces this method's
   * body, not its contract.
   */
  async upgradeSubscription(userId: string, planId: string) {
    if (!this.unpaidUpgradesAllowed) {
      // Deliberately not a 404: the route exists, the caller is simply not
      // allowed to grant themselves a paid tier without paying for it.
      throw new ForbiddenException(
        'Purchases are not available on this server. No payment provider is configured.',
      );
    }

    const plan = await this.db.query.subscriptionPlans.findFirst({
      where: eq(schema.subscriptionPlans.id, planId),
    });
    if (!plan) {
      throw new NotFoundException('Subscription plan not found');
    }

    const currentSub = await this.getUserSubscription(userId);
    if (currentSub && tierRank(currentSub.plan.tier) >= tierRank(plan.tier)) {
      throw new BadRequestException('Cannot downgrade or subscribe to the same tier via upgrade endpoint');
    }

    // Upsert logic for subscription
    if (currentSub) {
      const [updated] = await this.db
        .update(schema.userSubscriptions)
        .set({ planId: plan.id, updatedAt: new Date() })
        .where(eq(schema.userSubscriptions.id, currentSub.id))
        .returning();
      return updated;
    } else {
      const [created] = await this.db
        .insert(schema.userSubscriptions)
        .values({
          userId,
          planId: plan.id,
          status: 'active',
          startDate: new Date(),
        })
        .returning();
      return created;
    }
  }
}
