import { z } from 'zod';

export const loginSchema = z.object({
	email: z.email(),
	password: z.string().min(1, 'Password is required')
});
export type LoginSchema = typeof loginSchema;

export const registerSchema = z
	.object({
		email: z.email(),
		display_name: z.string().max(100).optional(),
		// No format validation — self-declared, no verification against BGG (it has no OAuth).
		bgg_username: z.string().trim().max(50).optional(),
		password: z.string().min(8, 'Password must be at least 8 characters'),
		confirm_password: z.string(),
		registration_code: z.string().min(1, 'Registration code is required')
	})
	.refine((d) => d.password === d.confirm_password, {
		message: 'Passwords do not match',
		path: ['confirm_password']
	});
export type RegisterSchema = typeof registerSchema;
