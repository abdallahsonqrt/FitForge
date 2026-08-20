import { Body, Controller, Delete, Get, Param, Patch, Post, Put, Query } from '@nestjs/common';
import { parseOrThrow } from '../../common/zod/parse-or-throw';
import { Roles } from '../../common/decorators/roles.decorator';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { ExercisesService } from './exercises.service';
import {
  createCategorySchema,
  createEquipmentSchema,
  createExerciseSchema,
  createMuscleSchema,
  exerciseIdSchema,
  listExercisesSchema,
  updateExerciseSchema,
} from './dto/create-exercise.dto';

interface AuthUser {
  id: string;
  role?: string | null;
}

/**
 * `/exercises` — the library itself. Media lives on the routes in
 * `ExerciseMediaController` under the same prefix.
 *
 * Reads are open to any signed-in user and return only published exercises;
 * writes are `@Roles('admin')`, enforced by the global `RolesGuard`.
 */
@Controller('exercises')
export class ExercisesController {
  constructor(private readonly exercises: ExercisesService) {}

  /**
   * `GET /exercises?search=bench&muscle=chest&equipment=barbell&difficulty=beginner`
   *
   * Paginated and filterable, because the library is meant to grow well past what
   * any client wants to hold at once.
   */
  @Get()
  async list(@CurrentUser() user: AuthUser, @Query() query: Record<string, string>) {
    return this.exercises.list(parseOrThrow(listExercisesSchema, query), viewer(user));
  }

  /**
   * `GET /exercises/taxonomy` — categories, muscles and equipment.
   *
   * Declared before `:id`: Nest matches in declaration order, so a `:id` above it
   * would swallow this path.
   */
  @Get('taxonomy')
  async taxonomy() {
    return this.exercises.taxonomy();
  }

  /** `GET /exercises/:idOrSlug` — the full exercise screen payload, media included. */
  @Get(':idOrSlug')
  async findOne(@CurrentUser() user: AuthUser, @Param('idOrSlug') idOrSlug: string) {
    return this.exercises.findOne(idOrSlug, viewer(user));
  }

  // ─── Admin ────────────────────────────────────────────────

  @Post()
  @Roles('admin')
  async create(@Body() body: unknown) {
    return this.exercises.create(parseOrThrow(createExerciseSchema, body ?? {}));
  }

  /** `PATCH /exercises/:id` — partial update; omitted relations are left as they are. */
  @Patch(':id')
  @Roles('admin')
  async update(@Param('id') id: string, @Body() body: unknown) {
    return this.exercises.update(
      parseOrThrow(exerciseIdSchema, id),
      parseOrThrow(updateExerciseSchema, body ?? {}),
    );
  }

  /** `PUT /exercises/:id` — kept as an alias of PATCH for existing admin clients. */
  @Put(':id')
  @Roles('admin')
  async replace(@Param('id') id: string, @Body() body: unknown) {
    return this.update(id, body);
  }

  @Delete(':id')
  @Roles('admin')
  async remove(@Param('id') id: string) {
    return this.exercises.remove(parseOrThrow(exerciseIdSchema, id));
  }

  // ─── Taxonomy admin ───────────────────────────────────────

  @Post('taxonomy/categories')
  @Roles('admin')
  async createCategory(@Body() body: unknown) {
    return this.exercises.createCategory(parseOrThrow(createCategorySchema, body ?? {}));
  }

  @Post('taxonomy/muscles')
  @Roles('admin')
  async createMuscle(@Body() body: unknown) {
    return this.exercises.createMuscle(parseOrThrow(createMuscleSchema, body ?? {}));
  }

  @Post('taxonomy/equipment')
  @Roles('admin')
  async createEquipment(@Body() body: unknown) {
    return this.exercises.createEquipment(parseOrThrow(createEquipmentSchema, body ?? {}));
  }
}

const viewer = (user: AuthUser | undefined) => ({ isAdmin: user?.role === 'admin' });
