import { dev } from '$app/environment';
import { error } from '@sveltejs/kit';
import type { PageServerLoad } from './$types';

/**
 * The embedding map, explore v1 — dev-only while Phil explores the space, picks anchor
 * games and decides what the guided tour should say. The coordinates endpoint it reads is
 * auth-gated regardless; this gate is about not shipping a page of PLACEHOLDER copy.
 * See docs/superpowers/specs/2026-09-16-embedding-map-explore-design.md.
 */
export const load: PageServerLoad = () => {
	if (!dev) error(404);
};
