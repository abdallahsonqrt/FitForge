import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import type { ExerciseImage, Muscle } from '../../database/schema';
import { StorageService } from '../../storage';
import { ExerciseMediaRepository } from '../exercise-media/exercise-media.repository';
import { ExerciseMediaMapper } from '../exercise-media/exercise-media.mapper';
import { MediaUrlService } from '../exercise-media/media-url.service';
import type { ExerciseVideoRecord } from '../exercise-media/exercise-media.types';
import { ExerciseRecord, ExercisesRepository } from './exercises.repository';
import {
  CreateCategoryDto,
  CreateEquipmentDto,
  CreateExerciseDto,
  CreateMuscleDto,
  ListExercisesDto,
  UpdateExerciseDto,
  slugify,
} from './dto/create-exercise.dto';
import {
  EquipmentRef,
  ExerciseDetail,
  ExerciseSummary,
  ExerciseTaxonomy,
  MuscleRef,
  PaginatedExercises,
  TaxonomyRef,
} from './exercises.types';

/** Who is asking — an admin sees drafts and storage details, nobody else does. */
export interface ViewerContext {
  isAdmin: boolean;
}

/**
 * The exercise library.
 *
 * Owns exercise metadata and the taxonomy it hangs off, and composes the media
 * the `exercise-media` module stores. It deliberately does not know how a video
 * is stored or how a URL is signed — it asks for a mapped video and embeds it.
 */
@Injectable()
export class ExercisesService {
  constructor(
    private readonly repository: ExercisesRepository,
    private readonly media: ExerciseMediaRepository,
    private readonly mediaMapper: ExerciseMediaMapper,
    private readonly urls: MediaUrlService,
    private readonly storage: StorageService,
  ) {}

  // ─── Reads ────────────────────────────────────────────────

  async list(dto: ListExercisesDto, viewer: ViewerContext): Promise<PaginatedExercises> {
    const { items, total } = await this.repository.list(
      {
        search: dto.search,
        categorySlug: dto.category,
        muscleSlug: dto.muscle,
        equipmentSlug: dto.equipment,
        difficulty: dto.difficulty,
        // Drafts are an admin concept; asking for them as a normal user changes nothing.
        includeUnpublished: viewer.isAdmin && dto.includeUnpublished === true,
      },
      { limit: dto.limit, offset: dto.offset },
    );

    const exerciseIds = items.map((item) => item.id);
    // Two queries for the whole page rather than two per row.
    const [videos, images] = await Promise.all([
      this.media.findVideosByExercises(exerciseIds),
      this.media.findImagesByExercises(exerciseIds),
    ]);

    const videosByExercise = groupBy(videos, (video) => video.exerciseId);
    const imagesByExercise = groupBy(images, (image) => image.exerciseId);

    const summaries = await Promise.all(
      items.map((item) =>
        this.toSummary(
          item,
          videosByExercise.get(item.id) ?? [],
          imagesByExercise.get(item.id) ?? [],
        ),
      ),
    );

    return { items: summaries, total, limit: dto.limit, offset: dto.offset };
  }

  /** Accepts an id or a slug, so links can be readable without an extra lookup. */
  async findOne(idOrSlug: string, viewer: ViewerContext): Promise<ExerciseDetail> {
    const exercise = UUID_PATTERN.test(idOrSlug)
      ? await this.repository.findById(idOrSlug)
      : await this.repository.findBySlug(idOrSlug);

    if (!exercise || (!exercise.isPublished && !viewer.isAdmin)) {
      throw new NotFoundException('Exercise not found.');
    }

    const [videos, images] = await Promise.all([
      this.media.findVideosByExercise(exercise.id, { includeUnready: viewer.isAdmin }),
      this.media.findImagesByExercise(exercise.id),
    ]);

    return this.toDetail(exercise, videos, images, viewer);
  }

  async taxonomy(): Promise<ExerciseTaxonomy> {
    const [categories, muscles, equipment] = await Promise.all([
      this.repository.listCategories(),
      this.repository.listMuscles(),
      this.repository.listEquipment(),
    ]);

    return {
      categories: categories.map((category) => ({
        id: category.id,
        slug: category.slug,
        name: category.name,
        description: category.description,
        orderIndex: category.orderIndex,
      })),
      muscles: muscles.map(toMuscleRef),
      equipment: equipment.map((item) => ({
        id: item.id,
        slug: item.slug,
        name: item.name,
        isBodyweight: item.isBodyweight,
      })),
    };
  }

  // ─── Writes ───────────────────────────────────────────────

  async create(dto: CreateExerciseDto): Promise<ExerciseDetail> {
    const slug = dto.slug ?? slugify(dto.name);
    if (await this.repository.findBySlug(slug)) {
      throw new ConflictException(`An exercise with the slug "${slug}" already exists.`);
    }

    const categoryId = await this.resolveCategoryId(dto.category);

    const created = await this.repository.insert({
      slug,
      name: dto.name,
      description: dto.description ?? null,
      categoryId,
      difficulty: dto.difficulty,
      instructions: dto.instructions,
      tips: dto.tips,
      commonMistakes: dto.commonMistakes,
      defaultSets: dto.defaultSets,
      defaultReps: dto.defaultReps,
      defaultRestSeconds: dto.defaultRestSeconds,
      isPublished: dto.isPublished,
    });

    await this.applyMuscles(created.id, dto);
    await this.applyEquipment(created.id, dto.equipment);

    return this.findOne(created.id, { isAdmin: true });
  }

  async update(id: string, dto: UpdateExerciseDto): Promise<ExerciseDetail> {
    const existing = await this.repository.findById(id);
    if (!existing) throw new NotFoundException('Exercise not found.');

    if (dto.slug && dto.slug !== existing.slug) {
      const clash = await this.repository.findBySlug(dto.slug);
      if (clash) throw new ConflictException(`An exercise with the slug "${dto.slug}" already exists.`);
    }

    await this.repository.update(id, {
      slug: dto.slug,
      name: dto.name,
      description: dto.description,
      categoryId: dto.category === undefined ? undefined : await this.resolveCategoryId(dto.category),
      difficulty: dto.difficulty,
      instructions: dto.instructions,
      tips: dto.tips,
      commonMistakes: dto.commonMistakes,
      defaultSets: dto.defaultSets,
      defaultReps: dto.defaultReps,
      defaultRestSeconds: dto.defaultRestSeconds,
      isPublished: dto.isPublished,
    });

    // Muscle links are replaced as a set, so they are only touched when the
    // request actually said something about them.
    if (dto.primaryMuscles || dto.secondaryMuscles || dto.stabilizerMuscles) {
      await this.applyMuscles(id, {
        primaryMuscles: dto.primaryMuscles ?? rolesOf(existing, 'primary'),
        secondaryMuscles: dto.secondaryMuscles ?? rolesOf(existing, 'secondary'),
        stabilizerMuscles: dto.stabilizerMuscles ?? rolesOf(existing, 'stabilizer'),
      });
    }
    if (dto.equipment) {
      await this.applyEquipment(id, dto.equipment);
    }

    return this.findOne(id, { isAdmin: true });
  }

  /**
   * Delete an exercise and everything it owns.
   *
   * Refused while workout plans still programme it: the foreign key would cascade
   * those days away silently, quietly shortening a plan someone is following.
   * Unpublishing is the reversible way to retire an exercise.
   */
  async remove(id: string): Promise<{ success: true; id: string }> {
    const existing = await this.repository.findById(id);
    if (!existing) throw new NotFoundException('Exercise not found.');

    const usages = await this.repository.countPlanUsages(id);
    if (usages > 0) {
      throw new ConflictException(
        `This exercise is used by ${usages} workout day${usages === 1 ? '' : 's'}. ` +
          'Remove it from those plans first, or set isPublished to false to retire it.',
      );
    }

    const keys = await this.repository.findMediaKeys(id);
    await this.repository.delete(id);
    // The media rows went with the exercise via cascade; the bytes are ours to free.
    await this.storage.deleteQuietly(keys);

    return { success: true, id };
  }

  // ─── Taxonomy writes ──────────────────────────────────────

  async createCategory(dto: CreateCategoryDto): Promise<TaxonomyRef> {
    const created = await this.repository.insertCategory({
      slug: dto.slug ?? slugify(dto.name),
      name: dto.name,
      description: dto.description ?? null,
      orderIndex: dto.orderIndex,
    });

    return { id: created.id, slug: created.slug, name: created.name };
  }

  async createMuscle(dto: CreateMuscleDto): Promise<MuscleRef> {
    return toMuscleRef(
      await this.repository.insertMuscle({
        slug: dto.slug ?? slugify(dto.name),
        name: dto.name,
        scientificName: dto.scientificName ?? null,
        region: dto.region,
      }),
    );
  }

  async createEquipment(dto: CreateEquipmentDto): Promise<Omit<EquipmentRef, 'isRequired'>> {
    const created = await this.repository.insertEquipment({
      slug: dto.slug ?? slugify(dto.name),
      name: dto.name,
      description: dto.description ?? null,
      isBodyweight: dto.isBodyweight,
    });

    return {
      id: created.id,
      slug: created.slug,
      name: created.name,
      isBodyweight: created.isBodyweight,
    };
  }

  // ─── Internals ────────────────────────────────────────────

  private async toSummary(
    exercise: ExerciseRecord,
    videos: ExerciseVideoRecord[],
    images: ExerciseImage[],
  ): Promise<ExerciseSummary> {
    return {
      id: exercise.id,
      slug: exercise.slug,
      name: exercise.name,
      description: exercise.description,
      difficulty: exercise.difficulty,
      category: exercise.category
        ? { id: exercise.category.id, slug: exercise.category.slug, name: exercise.category.name }
        : null,
      primaryMuscles: musclesWithRole(exercise, 'primary'),
      equipment: equipmentRefs(exercise),
      thumbnailUrl: await this.pickThumbnailUrl(videos, images),
      hasVideo: videos.some((video) => video.status === 'ready'),
      defaultSets: exercise.defaultSets,
      defaultReps: exercise.defaultReps,
      defaultRestSeconds: exercise.defaultRestSeconds,
      isPublished: exercise.isPublished,
    };
  }

  private async toDetail(
    exercise: ExerciseRecord,
    videos: ExerciseVideoRecord[],
    images: ExerciseImage[],
    viewer: ViewerContext,
  ): Promise<ExerciseDetail> {
    const options = { includeStorageDetails: viewer.isAdmin };
    const summary = await this.toSummary(exercise, videos, images);

    const [mappedVideos, mappedImages] = await Promise.all([
      this.mediaMapper.toVideos(videos, options),
      this.mediaMapper.toImages(images, options),
    ]);

    const playable = mappedVideos.filter((video) => video.status === 'ready');

    return {
      ...summary,
      secondaryMuscles: musclesWithRole(exercise, 'secondary'),
      stabilizerMuscles: musclesWithRole(exercise, 'stabilizer'),
      instructions: exercise.instructions,
      tips: exercise.tips,
      commonMistakes: exercise.commonMistakes,
      video: playable.find((video) => video.kind === 'primary') ?? null,
      previewVideo: playable.find((video) => video.kind === 'preview') ?? null,
      videos: mappedVideos,
      images: mappedImages,
      createdAt: exercise.createdAt.toISOString(),
      updatedAt: exercise.updatedAt.toISOString(),
    };
  }

  /**
   * Best poster frame available: the primary video's thumbnail, then any
   * standalone thumbnail or poster uploaded for the exercise.
   */
  private async pickThumbnailUrl(
    videos: ExerciseVideoRecord[],
    images: ExerciseImage[],
  ): Promise<string | null> {
    const fromVideo = videos.find((video) => video.kind === 'primary' && video.thumbnail)?.thumbnail;
    const standalone = images.find((image) => image.kind === 'thumbnail' || image.kind === 'poster');

    return this.urls.resolveUrl(fromVideo ?? standalone ?? null);
  }

  private async resolveCategoryId(ref?: string): Promise<string | null> {
    if (!ref) return null;

    const category = await this.repository.findCategory(ref);
    if (!category) throw new BadRequestException(`Unknown exercise category "${ref}".`);
    return category.id;
  }

  private async applyMuscles(
    exerciseId: string,
    dto: Pick<CreateExerciseDto, 'primaryMuscles' | 'secondaryMuscles' | 'stabilizerMuscles'>,
  ): Promise<void> {
    const groups = [
      { role: 'primary' as const, refs: dto.primaryMuscles ?? [] },
      { role: 'secondary' as const, refs: dto.secondaryMuscles ?? [] },
      { role: 'stabilizer' as const, refs: dto.stabilizerMuscles ?? [] },
    ];

    const allRefs = groups.flatMap((group) => group.refs);
    if (allRefs.length === 0) {
      await this.repository.replaceMuscles(exerciseId, []);
      return;
    }

    const resolved = await this.repository.resolveMuscles(allRefs);
    const byRef = indexByIdAndSlug(resolved);
    this.assertAllResolved(allRefs, byRef, 'muscle');

    // A muscle listed twice would violate the (exercise, muscle) primary key, and
    // the stronger role is the truthful one — so first mention wins.
    const seen = new Set<string>();
    const links: { muscleId: string; role: 'primary' | 'secondary' | 'stabilizer'; orderIndex: number }[] = [];

    for (const group of groups) {
      group.refs.forEach((ref, index) => {
        const muscle = byRef.get(ref)!;
        if (seen.has(muscle.id)) return;
        seen.add(muscle.id);
        links.push({ muscleId: muscle.id, role: group.role, orderIndex: index });
      });
    }

    await this.repository.replaceMuscles(exerciseId, links);
  }

  private async applyEquipment(exerciseId: string, refs: string[] = []): Promise<void> {
    if (refs.length === 0) {
      await this.repository.replaceEquipment(exerciseId, []);
      return;
    }

    const resolved = await this.repository.resolveEquipment(refs);
    const byRef = indexByIdAndSlug(resolved);
    this.assertAllResolved(refs, byRef, 'equipment');

    const seen = new Set<string>();
    const links: { equipmentId: string; isRequired: boolean; orderIndex: number }[] = [];

    refs.forEach((ref, index) => {
      const item = byRef.get(ref)!;
      if (seen.has(item.id)) return;
      seen.add(item.id);
      links.push({ equipmentId: item.id, isRequired: true, orderIndex: index });
    });

    await this.repository.replaceEquipment(exerciseId, links);
  }

  private assertAllResolved(
    refs: string[],
    resolved: Map<string, { id: string }>,
    label: string,
  ): void {
    const missing = [...new Set(refs)].filter((ref) => !resolved.has(ref));
    if (missing.length > 0) {
      throw new BadRequestException(
        `Unknown ${label}: ${missing.join(', ')}. Create it first, or use one from GET /exercises/taxonomy.`,
      );
    }
  }
}

// ─── Shaping helpers ──────────────────────────────────────────

const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

const toMuscleRef = (muscle: Muscle): MuscleRef => ({
  id: muscle.id,
  slug: muscle.slug,
  name: muscle.name,
  scientificName: muscle.scientificName,
  region: muscle.region,
});

const musclesWithRole = (
  exercise: ExerciseRecord,
  role: 'primary' | 'secondary' | 'stabilizer',
): MuscleRef[] =>
  exercise.muscles
    .filter((link) => link.role === role)
    .sort((a, b) => a.orderIndex - b.orderIndex)
    .map((link) => toMuscleRef(link.muscle));

const rolesOf = (exercise: ExerciseRecord, role: 'primary' | 'secondary' | 'stabilizer'): string[] =>
  musclesWithRole(exercise, role).map((muscle) => muscle.slug);

const equipmentRefs = (exercise: ExerciseRecord): EquipmentRef[] =>
  exercise.equipment
    .slice()
    .sort((a, b) => a.orderIndex - b.orderIndex)
    .map((link) => ({
      id: link.equipment.id,
      slug: link.equipment.slug,
      name: link.equipment.name,
      isBodyweight: link.equipment.isBodyweight,
      isRequired: link.isRequired,
    }));

/** Lets a caller look a row up by whichever of the two keys they supplied. */
const indexByIdAndSlug = <T extends { id: string; slug: string }>(rows: T[]): Map<string, T> => {
  const index = new Map<string, T>();
  for (const row of rows) {
    index.set(row.id, row);
    index.set(row.slug, row);
  }
  return index;
};

const groupBy = <T>(rows: T[], key: (row: T) => string): Map<string, T[]> => {
  const grouped = new Map<string, T[]>();
  for (const row of rows) {
    const bucket = grouped.get(key(row));
    if (bucket) bucket.push(row);
    else grouped.set(key(row), [row]);
  }
  return grouped;
};
