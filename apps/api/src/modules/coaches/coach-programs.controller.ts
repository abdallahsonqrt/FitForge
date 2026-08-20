import { Body, Controller, Delete, Get, Param, Patch, Post, Query } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { parseOrThrow } from '../../common/zod/parse-or-throw';
import { Roles } from '../../common/decorators/roles.decorator';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { CoachProgramsService } from './coach-programs.service';
import { uuidSchema } from './dto/coach-profile.dto';
import {
  attachWeekDaysSchema,
  createDayExerciseSchema,
  createProgramSchema,
  createWeekDaySchema,
  createWeekSchema,
  listOwnProgramsSchema,
  reorderDayExercisesSchema,
  reorderWeeksSchema,
  updateDayExerciseSchema,
  updateProgramSchema,
  updateWeekDaySchema,
  updateWeekSchema,
} from './dto/program.dto';

interface AuthUser {
  id: string;
  role?: string | null;
}

/**
 * `/coaches/me/programs` — the coach's program builder.
 *
 * Everything here is `@Roles('coach')`, but the role is only the outer gate: it
 * says the caller is *a* coach, not that they own the program in the path. The
 * service resolves the caller's own coach profile and re-scopes every query to
 * it, so the id in the URL can never widen access.
 *
 * `me` is in the path rather than a coach id for the same reason — there is no
 * route shape here that could address someone else's program.
 */
@ApiTags('coach-programs')
@ApiBearerAuth()
@Roles('coach')
@Controller('coaches/me/programs')
export class CoachProgramsController {
  constructor(private readonly programs: CoachProgramsService) {}

  @Get()
  @ApiOperation({ summary: 'List your own programs, drafts included' })
  async list(@CurrentUser() user: AuthUser, @Query() query: Record<string, unknown>) {
    return this.programs.list(user.id, parseOrThrow(listOwnProgramsSchema, query));
  }

  @Post()
  @ApiOperation({ summary: 'Create a program (starts as a draft)' })
  async create(@CurrentUser() user: AuthUser, @Body() body: unknown) {
    return this.programs.create(user.id, parseOrThrow(createProgramSchema, body ?? {}));
  }

  @Get(':planId')
  @ApiOperation({ summary: 'One of your programs with its full week outline' })
  async findOne(@CurrentUser() user: AuthUser, @Param('planId') planId: string) {
    return this.programs.findOne(user.id, parseOrThrow(uuidSchema, planId));
  }

  @Patch(':planId')
  @ApiOperation({ summary: 'Edit a program' })
  async update(
    @CurrentUser() user: AuthUser,
    @Param('planId') planId: string,
    @Body() body: unknown,
  ) {
    return this.programs.update(
      user.id,
      parseOrThrow(uuidSchema, planId),
      parseOrThrow(updateProgramSchema, body ?? {}),
    );
  }

  @Delete(':planId')
  @ApiOperation({ summary: 'Delete a program that nobody is enrolled on' })
  async remove(@CurrentUser() user: AuthUser, @Param('planId') planId: string) {
    return this.programs.remove(user.id, parseOrThrow(uuidSchema, planId));
  }

  // ─── Publication state ────────────────────────────────────

  @Post(':planId/publish')
  @ApiOperation({ summary: 'Publish a program so athletes can enrol' })
  async publish(@CurrentUser() user: AuthUser, @Param('planId') planId: string) {
    return this.programs.setVisibility(user.id, parseOrThrow(uuidSchema, planId), 'published');
  }

  @Post(':planId/archive')
  @ApiOperation({ summary: 'Close a program to new enrolments, keeping current ones' })
  async archive(@CurrentUser() user: AuthUser, @Param('planId') planId: string) {
    return this.programs.setVisibility(user.id, parseOrThrow(uuidSchema, planId), 'archived');
  }

  // ─── Weeks ────────────────────────────────────────────────

  @Get(':planId/weeks')
  @ApiOperation({ summary: 'The program outline, week by week' })
  async listWeeks(@CurrentUser() user: AuthUser, @Param('planId') planId: string) {
    return this.programs.listWeeks(user.id, parseOrThrow(uuidSchema, planId));
  }

  @Post(':planId/weeks')
  @ApiOperation({ summary: 'Append a week to the program' })
  async createWeek(
    @CurrentUser() user: AuthUser,
    @Param('planId') planId: string,
    @Body() body: unknown,
  ) {
    return this.programs.createWeek(
      user.id,
      parseOrThrow(uuidSchema, planId),
      parseOrThrow(createWeekSchema, body ?? {}),
    );
  }

  /**
   * Declared above `weeks/:weekId` — Nest matches in declaration order, and below
   * it `reorder` would be read as a week id.
   */
  @Patch(':planId/weeks/reorder')
  @ApiOperation({ summary: 'Reorder every week by listing the ids in their new order' })
  async reorderWeeks(
    @CurrentUser() user: AuthUser,
    @Param('planId') planId: string,
    @Body() body: unknown,
  ) {
    return this.programs.reorderWeeks(
      user.id,
      parseOrThrow(uuidSchema, planId),
      parseOrThrow(reorderWeeksSchema, body ?? {}),
    );
  }

  @Patch(':planId/weeks/:weekId')
  @ApiOperation({ summary: 'Rename a week or edit its notes' })
  async updateWeek(
    @CurrentUser() user: AuthUser,
    @Param('planId') planId: string,
    @Param('weekId') weekId: string,
    @Body() body: unknown,
  ) {
    return this.programs.updateWeek(
      user.id,
      parseOrThrow(uuidSchema, planId),
      parseOrThrow(uuidSchema, weekId),
      parseOrThrow(updateWeekSchema, body ?? {}),
    );
  }

  @Delete(':planId/weeks/:weekId')
  @ApiOperation({ summary: 'Delete a week and the days inside it' })
  async removeWeek(
    @CurrentUser() user: AuthUser,
    @Param('planId') planId: string,
    @Param('weekId') weekId: string,
  ) {
    return this.programs.removeWeek(
      user.id,
      parseOrThrow(uuidSchema, planId),
      parseOrThrow(uuidSchema, weekId),
    );
  }

  // ─── Days within a week ───────────────────────────────────

  @Post(':planId/weeks/:weekId/days')
  @ApiOperation({ summary: 'Add a session to a week' })
  async createWeekDay(
    @CurrentUser() user: AuthUser,
    @Param('planId') planId: string,
    @Param('weekId') weekId: string,
    @Body() body: unknown,
  ) {
    return this.programs.createWeekDay(
      user.id,
      parseOrThrow(uuidSchema, planId),
      parseOrThrow(uuidSchema, weekId),
      parseOrThrow(createWeekDaySchema, body ?? {}),
    );
  }

  /** Attach existing days of this program to the week, in the order given. */
  @Patch(':planId/weeks/:weekId/days')
  @ApiOperation({ summary: 'Attach and order this program’s days inside a week' })
  async attachWeekDays(
    @CurrentUser() user: AuthUser,
    @Param('planId') planId: string,
    @Param('weekId') weekId: string,
    @Body() body: unknown,
  ) {
    return this.programs.attachWeekDays(
      user.id,
      parseOrThrow(uuidSchema, planId),
      parseOrThrow(uuidSchema, weekId),
      parseOrThrow(attachWeekDaysSchema, body ?? {}),
    );
  }

  @Patch(':planId/weeks/:weekId/days/:dayId')
  @ApiOperation({ summary: 'Rename a session or move it within its week' })
  async updateWeekDay(
    @CurrentUser() user: AuthUser,
    @Param('planId') planId: string,
    @Param('weekId') weekId: string,
    @Param('dayId') dayId: string,
    @Body() body: unknown,
  ) {
    return this.programs.updateWeekDay(
      user.id,
      parseOrThrow(uuidSchema, planId),
      parseOrThrow(uuidSchema, weekId),
      parseOrThrow(uuidSchema, dayId),
      parseOrThrow(updateWeekDaySchema, body ?? {}),
    );
  }

  @Delete(':planId/weeks/:weekId/days/:dayId')
  @ApiOperation({ summary: 'Delete a session and the exercises prescribed in it' })
  async removeWeekDay(
    @CurrentUser() user: AuthUser,
    @Param('planId') planId: string,
    @Param('weekId') weekId: string,
    @Param('dayId') dayId: string,
  ) {
    return this.programs.removeWeekDay(
      user.id,
      parseOrThrow(uuidSchema, planId),
      parseOrThrow(uuidSchema, weekId),
      parseOrThrow(uuidSchema, dayId),
    );
  }

  // ─── Exercises within a day ───────────────────────────────
  //
  // Addressed under `days/:dayId` with no week segment, because
  // `workout_days.week_id` is nullable by design — a session drafted before it
  // was filed into a week is still a session that needs exercises in it.

  @Get(':planId/days/:dayId/exercises')
  @ApiOperation({ summary: 'The prescription for one session, in order' })
  async listDayExercises(
    @CurrentUser() user: AuthUser,
    @Param('planId') planId: string,
    @Param('dayId') dayId: string,
  ) {
    return this.programs.listDayExercises(
      user.id,
      parseOrThrow(uuidSchema, planId),
      parseOrThrow(uuidSchema, dayId),
    );
  }

  @Post(':planId/days/:dayId/exercises')
  @ApiOperation({ summary: 'Prescribe an exercise in this session' })
  async createDayExercise(
    @CurrentUser() user: AuthUser,
    @Param('planId') planId: string,
    @Param('dayId') dayId: string,
    @Body() body: unknown,
  ) {
    return this.programs.createDayExercise(
      user.id,
      parseOrThrow(uuidSchema, planId),
      parseOrThrow(uuidSchema, dayId),
      parseOrThrow(createDayExerciseSchema, body ?? {}),
    );
  }

  /**
   * Declared above `exercises/:id` — Nest matches in declaration order, and
   * below it `reorder` would be parsed as an exercise id and 400 on the uuid
   * check. Same hazard, same fix, as `weeks/reorder`.
   */
  @Patch(':planId/days/:dayId/exercises/reorder')
  @ApiOperation({ summary: 'Reorder a session by listing every exercise id in its new order' })
  async reorderDayExercises(
    @CurrentUser() user: AuthUser,
    @Param('planId') planId: string,
    @Param('dayId') dayId: string,
    @Body() body: unknown,
  ) {
    return this.programs.reorderDayExercises(
      user.id,
      parseOrThrow(uuidSchema, planId),
      parseOrThrow(uuidSchema, dayId),
      parseOrThrow(reorderDayExercisesSchema, body ?? {}),
    );
  }

  @Patch(':planId/days/:dayId/exercises/:id')
  @ApiOperation({ summary: 'Edit one prescription — sets, reps, tempo, RPE, notes' })
  async updateDayExercise(
    @CurrentUser() user: AuthUser,
    @Param('planId') planId: string,
    @Param('dayId') dayId: string,
    @Param('id') id: string,
    @Body() body: unknown,
  ) {
    return this.programs.updateDayExercise(
      user.id,
      parseOrThrow(uuidSchema, planId),
      parseOrThrow(uuidSchema, dayId),
      parseOrThrow(uuidSchema, id),
      parseOrThrow(updateDayExerciseSchema, body ?? {}),
    );
  }

  @Delete(':planId/days/:dayId/exercises/:id')
  @ApiOperation({ summary: 'Remove an exercise from this session' })
  async removeDayExercise(
    @CurrentUser() user: AuthUser,
    @Param('planId') planId: string,
    @Param('dayId') dayId: string,
    @Param('id') id: string,
  ) {
    return this.programs.removeDayExercise(
      user.id,
      parseOrThrow(uuidSchema, planId),
      parseOrThrow(uuidSchema, dayId),
      parseOrThrow(uuidSchema, id),
    );
  }
}
