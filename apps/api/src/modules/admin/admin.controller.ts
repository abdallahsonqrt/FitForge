import {
  Controller,
  Get,
  Post,
  Put,
  Patch,
  Delete,
  Body,
  Param,
  Query,
  ParseUUIDPipe,
} from '@nestjs/common';
import { z } from 'nestjs-zod/z';
import { AdminService } from './admin.service';
import { Roles } from '../../common/decorators/roles.decorator';
import { parseOrThrow } from '../../common/zod/parse-or-throw';
import {
  createSubscriptionPlanSchema,
  updateSubscriptionPlanSchema,
} from './dto/subscription-plan.dto';

/** Filter for the applications list. Absent means "every status". */
const applicationStatusSchema = z.enum(['pending', 'verified', 'rejected']).optional();

/**
 * A review decision. `pending` is not accepted: review moves an application
 * forward or rejects it, and putting one back into the queue would leave a
 * granted role behind with nothing to revoke it.
 */
const reviewApplicationSchema = z.object({
  status: z.enum(['verified', 'rejected']),
});

/**
 * Back-office endpoints. `RolesGuard` is registered globally in `AppModule`, so
 * the class-level `@Roles('admin')` covers every route below.
 *
 * Exercise content is *not* here: it moved to `/exercises` and
 * `/exercise-videos`, which carry the same role requirement and additionally
 * validate their payloads and clean up stored media. Two ways to write the same
 * rows, only one of which freed the bytes it orphaned, was a bug waiting to
 * happen.
 */
@Controller('admin')
@Roles('admin')
export class AdminController {
  constructor(private readonly adminService: AdminService) {}

  // --- Users ---
  @Get('users')
  async getUsers() {
    return this.adminService.getUsers();
  }

  /** `users.id` is a uuid — reject a malformed one before it reaches the driver. */
  @Delete('users/:id')
  async deleteUser(@Param('id', ParseUUIDPipe) id: string) {
    return this.adminService.deleteUser(id);
  }

  // --- Coach applications ---
  @Get('coaches')
  async getCoachApplications(@Query('status') status?: string) {
    return this.adminService.getCoachApplications(
      parseOrThrow(applicationStatusSchema, status),
    );
  }

  /** Approve or reject. Grants or revokes the `coach` role in the same transaction. */
  @Patch('coaches/:id')
  async reviewCoachApplication(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() body: unknown,
  ) {
    const { status } = parseOrThrow(reviewApplicationSchema, body);
    return this.adminService.reviewCoachApplication(id, status);
  }

  // --- Subscription plans ---
  @Get('plans')
  async getPlans() {
    return this.adminService.getPlans();
  }

  @Post('plans')
  async createPlan(@Body() body: unknown) {
    return this.adminService.createPlan(parseOrThrow(createSubscriptionPlanSchema, body));
  }

  /** `subscription_plans.id` is a uuid, same as above. */
  @Put('plans/:id')
  async updatePlan(@Param('id', ParseUUIDPipe) id: string, @Body() body: unknown) {
    return this.adminService.updatePlan(id, parseOrThrow(updateSubscriptionPlanSchema, body));
  }

  @Delete('plans/:id')
  async deletePlan(@Param('id', ParseUUIDPipe) id: string) {
    return this.adminService.deletePlan(id);
  }
}
