import { Body, Controller, Get, Param, Patch, Post, Query } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { parseOrThrow } from '../../common/zod/parse-or-throw';
import { Roles } from '../../common/decorators/roles.decorator';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { EnrollmentsService } from './enrollments.service';
import {
  createEnrollmentSchema,
  enrollmentIdSchema,
  listEnrollmentsSchema,
  updateEnrollmentSchema,
} from './dto/enrollment.dto';

interface AuthUser {
  id: string;
  role?: string | null;
}

/**
 * `/enrollments` — joining a coach, and the client list on the other side.
 *
 * Nothing here is public. Every route resolves the caller from their token and
 * scopes to their own side of the relationship; there is no route that takes an
 * athlete id or a coach id to list on behalf of.
 */
@ApiTags('enrollments')
@ApiBearerAuth()
@Controller('enrollments')
export class EnrollmentsController {
  constructor(private readonly enrollments: EnrollmentsService) {}

  @Post()
  @ApiOperation({ summary: 'Enrol with a coach and, optionally, one of their programs' })
  async create(@CurrentUser() user: AuthUser, @Body() body: unknown) {
    return this.enrollments.create(user.id, parseOrThrow(createEnrollmentSchema, body ?? {}));
  }

  @Get('me')
  @ApiOperation({ summary: 'Your own enrollments, with coach and program' })
  async listMine(@CurrentUser() user: AuthUser, @Query() query: Record<string, unknown>) {
    return this.enrollments.listMine(user.id, parseOrThrow(listEnrollmentsSchema, query));
  }

  /** `GET /enrollments/coach` — your clients. Coach role, own coach id only. */
  @Get('coach')
  @Roles('coach')
  @ApiOperation({ summary: 'Your client list, with each athlete’s training profile' })
  async listForCoach(@CurrentUser() user: AuthUser, @Query() query: Record<string, unknown>) {
    return this.enrollments.listForCoach(user.id, parseOrThrow(listEnrollmentsSchema, query));
  }

  /**
   * `PATCH /enrollments/:id` — advance the relationship.
   *
   * Open to either party; which transitions each may make is decided in the
   * service, where the enrollment itself says who they are.
   */
  @Patch(':id')
  @ApiOperation({ summary: 'Change an enrollment’s status or assigned program' })
  async update(
    @CurrentUser() user: AuthUser,
    @Param('id') id: string,
    @Body() body: unknown,
  ) {
    return this.enrollments.update(
      user.id,
      parseOrThrow(enrollmentIdSchema, id),
      parseOrThrow(updateEnrollmentSchema, body ?? {}),
    );
  }
}
