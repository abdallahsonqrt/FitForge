import { Injectable, Inject, NotFoundException } from '@nestjs/common';
import { NodePgDatabase } from 'drizzle-orm/node-postgres';
import { eq } from 'drizzle-orm';
import * as schema from '../../database/schema';
import { UpdateProfileDto } from './dto/update-profile.dto';
import { OnboardingDto } from './dto/onboarding.dto';

@Injectable()
export class UsersService {
  constructor(
    @Inject('DB_CONNECTION') private db: NodePgDatabase<typeof schema>,
  ) {}

  async getUserById(id: string) {
    const user = await this.db.query.users.findFirst({
      where: eq(schema.users.id, id),
    });

    if (!user) {
      throw new NotFoundException('User not found');
    }

    const { passwordHash, ...result } = user as any;
    return result;
  }

  async updateProfile(id: string, dto: UpdateProfileDto) {
    // A profile edit is a patch: only the fields the client actually sent are
    // written, so saving a name never blanks the athlete profile behind it.
    const changes = Object.fromEntries(
      Object.entries(dto).filter(([, value]) => value !== undefined),
    );

    const [updatedUser] = await this.db.update(schema.users)
      .set({ ...changes, updatedAt: new Date() })
      .where(eq(schema.users.id, id))
      .returning();

    if (!updatedUser) {
      throw new NotFoundException('User not found');
    }

    const { passwordHash, ...result } = updatedUser as any;
    return result;
  }

  async completeOnboarding(id: string, dto: OnboardingDto) {
    const { isOnboarded, dateOfBirth, ...profile } = dto;

    // Only write the fields the client actually sent, so a partial submission
    // never blanks out an answer given earlier in the flow.
    const changes = Object.fromEntries(
      Object.entries(profile).filter(([, value]) => value !== undefined),
    );

    const [updatedUser] = await this.db.update(schema.users)
      .set({
        ...changes,
        ...(dateOfBirth ? { dateOfBirth: dateOfBirth.slice(0, 10) } : {}),
        onboardingComplete: isOnboarded,
        updatedAt: new Date(),
      })
      .where(eq(schema.users.id, id))
      .returning();

    if (!updatedUser) {
      throw new NotFoundException('User not found');
    }

    const { passwordHash, ...result } = updatedUser as any;
    return result;
  }
}
