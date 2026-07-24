/**
 * Centralized TanStack Query key factories. One source of truth for cache keys so
 * invalidation stays consistent as views are added (detail now; list/facets in PR 5).
 */
export const gameKeys = {
	all: ['games'] as const,
	detail: (id: number) => [...gameKeys.all, 'detail', id] as const
};
