import { Controller, Get, Param, Query } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { parseOrThrow } from '../../common/zod/parse-or-throw';
import { Roles } from '../../common/decorators/roles.decorator';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { CoachClientsService } from './coach-clients.service';
import { uuidSchema } from './dto/coach-profile.dto';
import { clientDetailSchema, dashboardSchema } from './dto/coach-clients.dto';

interface AuthUser {
  id: string;
  role?: string | null;
}

/**
 * `/coaches/me/clients` and `/coaches/me/dashboard`.
 *
 * `me` is in the path for the same reason it is on the program builder: there is
 * no route shape here that could name another coach. The athlete id in
 * `clients/:athleteUserId` is not an exception — it is checked against a live
 * enrollment with the *calling* coach before a single log is read, so it can
 * only ever narrow, never widen.
 *
 * Registered ahead of `CoachesController` so `/coaches/me/...` is matched before
 * `/coaches/:id` gets a chance to read `me` as a coach id.
 */
@ApiTags('coach-clients')
@ApiBearerAuth()
@Roles('coach')
@Controller('coaches/me')
export class CoachClientsController {
  constructor(private readonly clients: CoachClientsService) {}

  @Get('dashboard')
  @ApiOperation({ summary: 'Counts, pending requests and recent client activity in one call' })
  async dashboard(@CurrentUser() user: AuthUser, @Query() query: Record<string, unknown>) {
    return this.clients.dashboard(user.id, parseOrThrow(dashboardSchema, query));
  }

  @Get('clients/:athleteUserId')
  @ApiOperation({ summary: 'One of your clients: progress, logs and enrollment state' })
  async findClient(
    @CurrentUser() user: AuthUser,
    @Param('athleteUserId') athleteUserId: string,
    @Query() query: Record<string, unknown>,
  ) {
    return this.clients.findClient(
      user.id,
      parseOrThrow(uuidSchema, athleteUserId),
      parseOrThrow(clientDetailSchema, query),
    );
  }
}
