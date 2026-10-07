/**
 * The body of `POST /api/similar`: a seed game and the pool to search within, as game ids.
 *
 * Help me find a game sends every game that matches the reader's answers (worked out in the
 * browser's catalog with the same filter that draws the list), so "More like this" keeps
 * those answers. One broad answer can match ~12,000 games, so the pool is posted, not put in
 * a URL. The warehouse caps it at the same number.
 */
export const MAX_POOL_IDS = 50_000;

export type IdPool = { ok: true; id: number; ids: number[] } | { ok: false; reason: string };

const isGameId = (v: unknown): v is number => Number.isInteger(v) && (v as number) > 0;

export function parseIdPool(body: unknown): IdPool {
	if (body == null || typeof body !== 'object') return { ok: false, reason: 'Expected a JSON object.' };
	const { id, ids } = body as { id?: unknown; ids?: unknown };
	if (!isGameId(id)) return { ok: false, reason: 'id must be a game id.' };
	if (!Array.isArray(ids) || ids.length === 0) return { ok: false, reason: 'ids must be a non-empty list.' };
	if (ids.length > MAX_POOL_IDS) return { ok: false, reason: `ids is limited to ${MAX_POOL_IDS.toLocaleString()} games.` };
	if (!ids.every(isGameId)) return { ok: false, reason: 'ids must all be game ids.' };
	return { ok: true, id, ids: [...new Set(ids)] };
}
