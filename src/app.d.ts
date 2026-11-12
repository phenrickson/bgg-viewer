// See https://svelte.dev/docs/kit/types#app.d.ts
// for information about these interfaces
/// <reference types="vite/client" />
import type { SessionUser } from '$lib/server/auth/session';
import type { GenealogyState } from '$lib/map/genealogy-url';

declare global {
	/** Injected by vite.config.ts's `define`, from package.json's version — the same number
	    release-please bumps on every release. */
	const __APP_VERSION__: string;

	namespace App {
		// interface Error {}
		interface Locals {
			user: SessionUser | null;
		}
		interface PageData {
			user?: SessionUser | null;
			isAdmin?: boolean;
			breadcrumbs?: { label: string; href?: string }[];
			subtitle?: string;
		}
		/** Shallow-routing state (`pushState`/`replaceState`); see `genealogy-url.ts` `currentState`. */
		interface PageState {
			genealogy?: GenealogyState;
		}
		// interface Platform {}
	}
}

export {};
