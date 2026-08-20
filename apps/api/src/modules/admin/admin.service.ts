import { Injectable, Inject, NotFoundException } from '@nestjs/common';
import { NodePgDatabase } from 'drizzle-orm/node-postgres';
import { eq, inArray } from 'drizzle-orm';
import * as schema from '../../database/schema';
import type {
  CreateSubscriptionPlanDto,
  UpdateSubscriptionPlanDto,
} from './dto/subscription-plan.dto';

@Injectable()
export class AdminService {
  constructor(@Inject('DB_CONNECTION') private readonly db: NodePgDatabase<typeof schema>) {}

  // Users
  /**
   * Every other read path strips `passwordHash` before it leaves the service
   * (`users.service.ts`, `jwt.strategy.ts`); an unprojected `findMany` here
   * handed the whole argon2 hash of every account to the admin console.
   */
  async getUsers() {
    return this.db.query.users.findMany({
      columns: { passwordHash: false },
    });
  }

  async deleteUser(id: string) {
    const [deleted] = await this.db.delete(schema.users).where(eq(schema.users.id, id)).returning();
    if (!deleted) throw new NotFoundException('User not found');
    return { success: true, deleted };
  }

  // ─── Coach applications ─────────────────────────────────────

  /**
   * Applications awaiting review, newest first, with the applicant attached.
   *
   * `POST /coaches/apply` creates the profile as `pending` and deliberately does
   * not promote its own applicant. This is the other half of that flow — without
   * it an application had no reader and no way to ever be approved.
   */
  async getCoachApplications(status?: 'pending' | 'verified' | 'rejected') {
    const rows = await this.db.query.coachProfiles.findMany({
      where: status ? eq(schema.coachProfiles.verificationStatus, status) : undefined,
      orderBy: (profiles, { desc }) => [desc(profiles.createdAt)],
    });

    if (rows.length === 0) return [];

    const applicants = await this.db.query.users.findMany({
      where: inArray(
        schema.users.id,
        rows.map((row) => row.userId),
      ),
      columns: { id: true, email: true, firstName: true, lastName: true, role: true },
    });
    const byId = new Map(applicants.map((user) => [user.id, user]));

    return rows.map((row) => ({
      id: row.id,
      userId: row.userId,
      headline: row.headline,
      bio: row.bio,
      specialties: row.specialties,
      yearsExperience: row.yearsExperience,
      credentials: row.credentials,
      verificationStatus: row.verificationStatus,
      verifiedAt: row.verifiedAt,
      createdAt: row.createdAt,
      applicant: byId.get(row.userId) ?? null,
    }));
  }

  /**
   * Approve or reject an application.
   *
   * The profile status and the account role move **in one transaction** on
   * purpose. They are checked by two different mechanisms — `RolesGuard` reads
   * `users.role`, while `CoachAccessService.requireProfileByUserId` needs the
   * profile row — so a half-applied review produces an account that passes one
   * check and fails the other: either a `coach` role with no profile (403 telling
   * them to apply, which they already did), or a verified profile the role guard
   * still rejects. Neither is recoverable by the user.
   *
   * Rejecting also demotes, so revoking a mistaken approval actually takes effect.
   */
  async reviewCoachApplication(id: string, status: 'verified' | 'rejected') {
    return this.db.transaction(async (tx) => {
      const [profile] = await tx
        .select()
        .from(schema.coachProfiles)
        .where(eq(schema.coachProfiles.id, id));

      if (!profile) throw new NotFoundException('Coach application not found');

      const [updated] = await tx
        .update(schema.coachProfiles)
        .set({
          verificationStatus: status,
          verifiedAt: status === 'verified' ? new Date() : null,
          updatedAt: new Date(),
        })
        .where(eq(schema.coachProfiles.id, id))
        .returning();

      // Never touch an admin's role: demoting one on a rejected application
      // would lock them out of the screen they just used.
      const [applicant] = await tx
        .select({ role: schema.users.role })
        .from(schema.users)
        .where(eq(schema.users.id, profile.userId));

      if (applicant && applicant.role !== 'admin') {
        await tx
          .update(schema.users)
          .set({ role: status === 'verified' ? 'coach' : 'user', updatedAt: new Date() })
          .where(eq(schema.users.id, profile.userId));
      }

      return { profile: updated, roleGranted: status === 'verified' };
    });
  }

  // Exercise CRUD lives in `ExercisesService` (`/exercises`), which validates the
  // payload, maintains the muscle/equipment links and deletes stored media.

  // Plans
  async getPlans() {
    return this.db.query.subscriptionPlans.findMany();
  }

  async createPlan(data: CreateSubscriptionPlanDto) {
    const [created] = await this.db.insert(schema.subscriptionPlans).values(data).returning();
    return created;
  }

  async updatePlan(id: string, data: UpdateSubscriptionPlanDto) {
    const [updated] = await this.db.update(schema.subscriptionPlans).set(data).where(eq(schema.subscriptionPlans.id, id)).returning();
    if (!updated) throw new NotFoundException('Plan not found');
    return updated;
  }

  async deletePlan(id: string) {
    const [deleted] = await this.db.delete(schema.subscriptionPlans).where(eq(schema.subscriptionPlans.id, id)).returning();
    if (!deleted) throw new NotFoundException('Plan not found');
    return { success: true, deleted };
  }
}
