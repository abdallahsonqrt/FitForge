import { describe, expect, it } from 'vitest';
import { z } from 'nestjs-zod/z';
import { athleteProfileFields, EQUIPMENT_SLUGS } from './athlete-profile.schema';

/**
 * These fields are what coach and program matching compares against, so a bad
 * value stored here is a bad match later. The schema is the only thing standing
 * between the request body and the column.
 */
const schema = z.object(athleteProfileFields);

describe('athleteProfileFields', () => {
  it('accepts an empty body — every field is optional so old clients keep working', () => {
    expect(schema.parse({})).toEqual({});
  });

  it('accepts a full athlete profile', () => {
    const input = {
      sport: 'calisthenics',
      trainingLocation: 'home' as const,
      availableEquipment: ['bodyweight', 'pull-up-bar'],
      sessionDurationMinutes: 45,
      injuriesNotes: 'Sore left shoulder.',
    };
    expect(schema.parse(input)).toEqual(input);
  });

  it('rejects a training location outside the enum', () => {
    expect(schema.safeParse({ trainingLocation: 'beach' }).success).toBe(false);
  });

  it('rejects equipment that is not in the catalogue vocabulary', () => {
    expect(schema.safeParse({ availableEquipment: ['jetpack'] }).success).toBe(false);
  });

  it('accepts every catalogue slug', () => {
    expect(schema.safeParse({ availableEquipment: [...EQUIPMENT_SLUGS] }).success).toBe(true);
  });

  it('rejects a repeated equipment slug', () => {
    expect(schema.safeParse({ availableEquipment: ['dumbbells', 'dumbbells'] }).success).toBe(false);
  });

  it('accepts bodyweight on its own — training with no kit is a real answer', () => {
    expect(schema.parse({ availableEquipment: ['bodyweight'] })).toEqual({
      availableEquipment: ['bodyweight'],
    });
  });

  it('holds session duration to a sane range', () => {
    expect(schema.safeParse({ sessionDurationMinutes: 5 }).success).toBe(false);
    expect(schema.safeParse({ sessionDurationMinutes: 600 }).success).toBe(false);
    expect(schema.safeParse({ sessionDurationMinutes: 30.5 }).success).toBe(false);
    expect(schema.safeParse({ sessionDurationMinutes: 10 }).success).toBe(true);
    expect(schema.safeParse({ sessionDurationMinutes: 240 }).success).toBe(true);
  });

  it('rejects a blank or oversized sport', () => {
    expect(schema.safeParse({ sport: '   ' }).success).toBe(false);
    expect(schema.safeParse({ sport: 'x'.repeat(101) }).success).toBe(false);
  });
});
