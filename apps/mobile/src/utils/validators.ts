import { z } from 'zod';

export const emailValidator = z.string().email('Please enter a valid email address.');

export const passwordValidator = z.string().min(8, 'Password must be at least 8 characters long.');

export const nameValidator = z.string().min(2, 'Name must be at least 2 characters long.');
