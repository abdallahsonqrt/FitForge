import { Body, Controller, Get, Param, Patch, Post, Query } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { parseOrThrow } from '../../common/zod/parse-or-throw';
import { Public } from '../../common/decorators/public.decorator';
import { Roles } from '../../common/decorators/roles.decorator';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { CoachesService } from './coaches.service';
import { applyAsCoachSchema, updateCoachProfileSchema, uuidSchema } from './dto/coach-profile.dto';
import { listCoachesSchema, recommendCoachesSchema } from './dto/list-coaches.dto';

interface AuthUser {
  id: string;
  role?: string | null;
}

/**
 * `/coaches` — the directory, the profile screen, and a coach's own storefront.
 *
 * Route order is load-bearing. Nest matches in declaration order, so `me`,
 * `recommended` and `apply` are all declared above `:id`; moved below it, each
 * would be swallowed as a coach id and answered with a 404.
 */
@ApiTags('coaches')
@Controller('coaches')
export class CoachesController {
  constructor(private readonly coaches: CoachesService) {}

  /**
   * `GET /coaches?goal=muscle_gain&equipment=pull-up-bar,bands&language=en`
   *
   * Public: the landing page shows featured coaches before anyone has an
   * account, and browsing is how a visitor decides to make one. Only verified
   * coaches are ever returned.
   */
  @Get()
  @Public()
  @ApiOperation({ summary: 'Browse verified coaches' })
  async list(@Query() query: Record<string, unknown>) {
    return this.coaches.list(parseOrThrow(listCoachesSchema, query));
  }

  /**
   * `GET /coaches/recommended` — the last step of onboarding.
   *
   * Authenticated, because the ranking is computed from the caller's own
   * onboarding answers rather than from anything in the query string.
   */
  @Get('recommended')
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Coaches ranked against your own training profile' })
  async recommended(@CurrentUser() user: AuthUser, @Query() query: Record<string, unknown>) {
    return this.coaches.recommend(user.id, parseOrThrow(recommendCoachesSchema, query));
  }

  // ─── The coach's own profile ──────────────────────────────

  @Get('me')
  @Roles('coach')
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Your own coach profile, including private credentials' })
  async findMine(@CurrentUser() user: AuthUser) {
    return this.coaches.findMine(user.id);
  }

  @Patch('me')
  @Roles('coach')
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Edit your own coach profile' })
  async updateMine(@CurrentUser() user: AuthUser, @Body() body: unknown) {
    return this.coaches.updateMine(user.id, parseOrThrow(updateCoachProfileSchema, body ?? {}));
  }

  /**
   * `POST /coaches/apply` — open to any signed-in user, since the applicant is by
   * definition not a coach yet. Creates a `pending` profile and nothing more.
   */
  @Post('apply')
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Apply to become a coach (creates a pending profile)' })
  async apply(@CurrentUser() user: AuthUser, @Body() body: unknown) {
    return this.coaches.apply(user.id, parseOrThrow(applyAsCoachSchema, body ?? {}));
  }

  /** `GET /coaches/:id` — the profile screen, with the coach's published programs. */
  /**
   * Must stay above `@Get(':id')`: Nest matches in declaration order, and the
   * uuid route would otherwise swallow the literal `application` and 400 on it.
   */
  @Get('application')
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Your own coach application and its review status' })
  async myApplication(@CurrentUser() user: AuthUser) {
    return this.coaches.findMyApplication(user.id);
  }

  @Get(':id')
  @Public()
  @ApiOperation({ summary: 'A verified coach and their published programs' })
  async findOne(@Param('id') id: string) {
    return this.coaches.findOne(parseOrThrow(uuidSchema, id));
  }
}
