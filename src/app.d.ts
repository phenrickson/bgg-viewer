// See https://svelte.dev/docs/kit/types#app.d.ts
// for information about these interfaces
import type { SessionUser } from '$lib/server/auth/session';

declare global {
	namespace App {
		// interface Error {}
		interface Locals {
			user: SessionUser | null;
		}
		interface PageData {
			user?: SessionUser | null;
			breadcrumbs?: { label: string; href?: string }[];
			subtitle?: string;
		}
		// interface PageState {}
		// interface Platform {}
	}
}

export {};
