import { ConflictException, Inject, Injectable, NotFoundException } from '@nestjs/common';
import { NodePgDatabase } from 'drizzle-orm/node-postgres';
import { SQL, and, arrayOverlaps, asc, count, desc, eq, inArray, sql } from 'drizzle-orm';
import * as schema from '../../database/schema';
import type { CoachProfile } from '../../database/schema';
import { CoachAccessService } from './coach-access.service';
import {
  CoachProfileRow,
  ProgramSummaryResponse,
  toCoachSummary,
  toOwnCoachProfile,
  toProgramSummary,
  toPublicCoachProfile,
} from './coaches.mapper';
import type { ApplyAsCoachDto, UpdateCoachProfileDto } from './dto/coach-profile.dto';
import type { ListCoachesDto, RecommendCoachesDto } from './dto/list-coaches.dto';

/**
 * The coach directory, coach profiles, and coach↔athlete matching.
 *
 * One rule governs every read here: **only `verified` coaches are ever returned
 * to anyone but their owner.** Phase 1 of the marketplace is curated, and a
 * pending or rejected coach appearing in a listing would present an unreviewed
 * stranger as vetted. The filter is applied in `directoryScope()` and is a
 * mandatory conjunct of every public query, never an option a caller can drop.
 */

/**
 * Match weights. Deliberately small integers rather than a tuned model: the
 * onboarding screen tells the athlete *why* a coach was suggested, and a reason
 * list is only honest if the ranking behind it is something a human can follow.
 */
const MATCH_WEIGHTS = {
  sport: 3,
  goal: 3,
  level: 2,
  location: 2,
  equipment: 2,
} as const;

/**
 * Phase 1 is 3–10 curated coaches, so ranking happens in memory over the whole
 * verified set. The cap is a guard rail, not a design: past it, scoring belongs
 * in SQL.
 */
const RECOMMENDATION_POOL_LIMIT = 200;

/**
 * The athlete's own answers, as matching compares them. Exported because it is
 * echoed back in the recommendation response, and declaration emit cannot name a
 * type it cannot import.
 */
export interface AthleteProfile {
  sport: string | null;
  goal: (typeof schema.fitnessGoalEnum.enumValues)[number] | null;
  level: (typeof schema.experienceLevelEnum.enumValues)[number] | null;
  trainingLocation: (typeof schema.trainingLocationEnum.enumValues)[number] | null;
  availableEquipment: string[];
}

@Injectable()
export class CoachesService {
  constructor(
    @Inject('DB_CONNECTION') private readonly db: NodePgDatabase<typeof schema>,
    private readonly access: CoachAccessService,
  ) {}

  // ─── Public directory ─────────────────────────────────────

  /**
   * `GET /coaches` — the browsable directory.
   *
   * Array filters use Postgres' overlap operator: a coach matches if they
   * support *any* of the requested values. "Supports all of them" would read as
   * the stricter, more correct filter but in practice hides good matches — an
   * athlete ticking three pieces of equipment wants a coach who can work with
   * their kit, not one who insists on all of it.
   */
  async list(dto: ListCoachesDto) {
    const where = this.directoryScope([
      dto.goal && arrayOverlaps(schema.coachProfiles.supportedGoals, dto.goal),
      dto.level && arrayOverlaps(schema.coachProfiles.supportedLevels, dto.level),
      dto.equipment && arrayOverlaps(schema.coachProfiles.supportedEquipment, dto.equipment),
      dto.trainingLocation &&
        arrayOverlaps(schema.coachProfiles.trainingLocations, dto.trainingLocation),
      // Sports live in `specialties`; the coach table has no separate sport column.
      dto.sport && arrayOverlaps(schema.coachProfiles.specialties, dto.sport),
      dto.language && arrayOverlaps(schema.coachProfiles.languages, dto.language),
      dto.acceptingClients !== undefined &&
        eq(schema.coachProfiles.acceptingClients, dto.acceptingClients),
    ]);

    const [rows, [totals]] = await Promise.all([
      this.db.query.coachProfiles.findMany({
        where,
        with: { user: { columns: { id: true, firstName: true, lastName: true, avatarUrl: true } } },
        // Open books first, then best rated. `NULLS LAST` keeps a brand-new coach
        // with no ratings below a proven one rather than at the top.
        orderBy: [
          desc(schema.coachProfiles.acceptingClients),
          sql`${schema.coachProfiles.ratingAvg} DESC NULLS LAST`,
          desc(schema.coachProfiles.ratingCount),
          asc(schema.coachProfiles.createdAt),
        ],
        limit: dto.limit,
        offset: dto.offset,
      }),
      this.db.select({ value: count() }).from(schema.coachProfiles).where(where),
    ]);

    return {
      items: rows.map((row) => toCoachSummary(row)),
      total: totals?.value ?? 0,
      limit: dto.limit,
      offset: dto.offset,
    };
  }

  /**
   * `GET /coaches/:id` — a coach profile with the programs an athlete may
   * actually enrol on.
   *
   * Only `published` programs are attached. Drafts are the coach's workspace and
   * archived programs no longer accept new clients, so listing either here would
   * advertise something that cannot be bought.
   */
  async findOne(coachId: string) {
    const coach = await this.db.query.coachProfiles.findFirst({
      where: this.directoryScope([eq(schema.coachProfiles.id, coachId)]),
      with: { user: { columns: { id: true, firstName: true, lastName: true, avatarUrl: true } } },
    });
    if (!coach) throw new NotFoundException('Coach not found.');

    const [programs, activeClients] = await Promise.all([
      this.publishedProgramsFor([coach.id]),
      this.access.activeClientCount(coach.id),
    ]);

    return {
      ...toPublicCoachProfile(coach, activeClients),
      programs: programs.get(coach.id) ?? [],
    };
  }

  /**
   * `GET /coaches/recommended` — the end of onboarding.
   *
   * Scores every verified coach against the caller's own answers and returns the
   * reasons alongside the rank. `score` is the fraction of the dimensions the
   * athlete actually filled in that the coach satisfies, so an athlete who
   * answered two questions is not penalised against one who answered five.
   */
  async recommend(userId: string, dto: RecommendCoachesDto) {
    const athlete = await this.athleteProfile(userId);

    const pool = await this.db.query.coachProfiles.findMany({
      where: this.directoryScope([]),
      with: { user: { columns: { id: true, firstName: true, lastName: true, avatarUrl: true } } },
      limit: RECOMMENDATION_POOL_LIMIT,
    });

    const ranked = pool
      .map((coach) => ({ coach, ...this.scoreCoach(coach, athlete) }))
      .sort(
        (a, b) =>
          b.score - a.score ||
          Number(b.coach.acceptingClients) - Number(a.coach.acceptingClients) ||
          (b.coach.ratingAvg ?? 0) - (a.coach.ratingAvg ?? 0) ||
          b.coach.ratingCount - a.coach.ratingCount,
      )
      .slice(0, dto.limit);

    const programs = await this.publishedProgramsFor(ranked.map((entry) => entry.coach.id));

    return {
      // Echoed back so the client can show "based on your answers" — and so an
      // empty athlete profile explains an unranked list rather than looking broken.
      basedOn: athlete,
      items: ranked.map((entry) => ({
        coach: toCoachSummary(entry.coach),
        score: entry.score,
        reasons: entry.reasons,
        programs: programs.get(entry.coach.id) ?? [],
      })),
    };
  }

  // ─── The coach's own profile ──────────────────────────────

  /** `GET /coaches/me` — includes the private `credentials` proof links. */
  async findMine(userId: string) {
    const profile = await this.access.requireProfileByUserId(userId);
    const activeClients = await this.access.activeClientCount(profile.id);
    return toOwnCoachProfile(profile as CoachProfileRow, activeClients);
  }

  /**
   * `PATCH /coaches/me`.
   *
   * The DTO cannot express `verificationStatus`, `verifiedAt`, `ratingAvg` or
   * `ratingCount`, so no edit here can promote a coach or inflate their rating —
   * those columns move only through admin review and the reviews system.
   */
  async updateMine(userId: string, dto: UpdateCoachProfileDto) {
    const profile = await this.access.requireProfileByUserId(userId);

    const [updated] = await this.db
      .update(schema.coachProfiles)
      .set({ ...dto, updatedAt: new Date() })
      .where(eq(schema.coachProfiles.id, profile.id))
      .returning();

    const activeClients = await this.access.activeClientCount(profile.id);
    return toOwnCoachProfile(updated as CoachProfileRow, activeClients);
  }

  /**
   * `POST /coaches/apply` — a user asks to become a coach.
   *
   * Creates the profile as `pending` and nothing else. It does **not** grant the
   * `coach` role and does not verify: an application that promoted its own
   * applicant would make the whole verification badge meaningless. An admin
   * flips both.
   */
  async apply(userId: string, dto: ApplyAsCoachDto) {
    const existing = await this.access.findProfileByUserId(userId);
    if (existing) {
      throw new ConflictException(
        `You already have a coach profile (status: ${existing.verificationStatus}).`,
      );
    }

    const [created] = await this.db
      .insert(schema.coachProfiles)
      .values({ ...dto, userId, verificationStatus: 'pending', verifiedAt: null })
      .returning();

    return toOwnCoachProfile(created as CoachProfileRow, 0);
  }

  /**
   * `GET /coaches/application` — the caller's own application, or `null`.
   *
   * Deliberately **not** behind `@Roles('coach')`, unlike `/coaches/me`. Between
   * applying and being verified an applicant still has the `user` role, so the
   * coach-gated route 403s them — which left them unable to see the status of
   * the thing they had just submitted. This is the one coach-profile read that a
   * non-coach is allowed, and it is scoped to their own row.
   */
  async findMyApplication(userId: string) {
    const existing = await this.access.findProfileByUserId(userId);
    if (!existing) return null;

    const activeClients = await this.access.activeClientCount(existing.id);
    return toOwnCoachProfile(existing as CoachProfileRow, activeClients);
  }

  // ─── Internals ────────────────────────────────────────────

  /**
   * The mandatory public filter. Takes the caller's extra conditions and returns
   * them ANDed with "verified" — there is no code path that builds a directory
   * query without it.
   */
  private directoryScope(conditions: (SQL | undefined | false)[]): SQL {
    const clauses = conditions.filter((clause): clause is SQL => Boolean(clause));
    return and(eq(schema.coachProfiles.verificationStatus, 'verified'), ...clauses) as SQL;
  }

  private async athleteProfile(userId: string): Promise<AthleteProfile> {
    const user = await this.db.query.users.findFirst({
      where: eq(schema.users.id, userId),
      columns: {
        sport: true,
        fitnessGoal: true,
        experienceLevel: true,
        trainingLocation: true,
        availableEquipment: true,
      },
    });
    if (!user) throw new NotFoundException('User not found.');

    return {
      sport: user.sport,
      goal: user.fitnessGoal,
      level: user.experienceLevel,
      trainingLocation: user.trainingLocation,
      availableEquipment: user.availableEquipment ?? [],
    };
  }

  /**
   * One dimension at a time, each contributing its weight to both the numerator
   * and the denominator. A dimension the athlete left blank contributes to
   * neither, which is what keeps `score` comparable across half-filled profiles.
   */
  private scoreCoach(coach: CoachProfile, athlete: AthleteProfile) {
    let earned = 0;
    let possible = 0;
    const reasons: string[] = [];

    const consider = (weight: number, matched: boolean, reason: string) => {
      possible += weight;
      if (!matched) return;
      earned += weight;
      reasons.push(reason);
    };

    if (athlete.sport) {
      const wanted = slugify(athlete.sport);
      consider(
        MATCH_WEIGHTS.sport,
        (coach.specialties ?? []).some((specialty) => slugify(specialty) === wanted),
        `Specialises in ${athlete.sport}`,
      );
    }
    if (athlete.goal) {
      consider(
        MATCH_WEIGHTS.goal,
        (coach.supportedGoals ?? []).includes(athlete.goal),
        `Coaches for ${athlete.goal.replace(/_/g, ' ')}`,
      );
    }
    if (athlete.level) {
      consider(
        MATCH_WEIGHTS.level,
        (coach.supportedLevels ?? []).includes(athlete.level),
        `Works with ${athlete.level} athletes`,
      );
    }
    if (athlete.trainingLocation) {
      consider(
        MATCH_WEIGHTS.location,
        (coach.trainingLocations ?? []).includes(athlete.trainingLocation),
        `Programs for training at ${athlete.trainingLocation}`,
      );
    }
    if (athlete.availableEquipment.length > 0) {
      const supported = new Set(coach.supportedEquipment ?? []);
      const shared = athlete.availableEquipment.filter((slug) => supported.has(slug));
      consider(
        MATCH_WEIGHTS.equipment,
        shared.length > 0,
        `Uses equipment you have: ${shared.join(', ')}`,
      );
    }

    if (coach.acceptingClients) reasons.push('Currently accepting clients');

    return {
      // Two decimals: this number is rendered as a percentage, not summed.
      score: possible === 0 ? 0 : Math.round((earned / possible) * 100) / 100,
      reasons,
    };
  }

  /** Published programs for a set of coaches, in one query, grouped by coach. */
  private async publishedProgramsFor(
    coachIds: string[],
  ): Promise<Map<string, ProgramSummaryResponse[]>> {
    const grouped = new Map<string, ProgramSummaryResponse[]>();
    if (coachIds.length === 0) return grouped;

    const rows = await this.db.query.workoutPlans.findMany({
      where: and(
        inArray(schema.workoutPlans.coachId, coachIds),
        eq(schema.workoutPlans.visibility, 'published'),
      ),
      orderBy: [asc(schema.workoutPlans.name)],
    });

    for (const row of rows) {
      if (!row.coachId) continue;
      const bucket = grouped.get(row.coachId) ?? [];
      bucket.push(toProgramSummary(row));
      grouped.set(row.coachId, bucket);
    }
    return grouped;
  }
}

/** "Calisthenics & Skills" → "calisthenics-skills", so free text matches a slug. */
function slugify(value: string): string {
  return value
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');
}
