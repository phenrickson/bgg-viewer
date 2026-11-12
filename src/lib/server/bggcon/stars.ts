/**
 * A user's starred BGG.CON games: a list of BGG ids in `bggcon/stars/{user_id}.json`, so the
 * same stars show on the laptop and the phone.
 */
import { gcsStore, type JsonStore } from './store';

/** Far more than anyone stars for one con, small enough to keep the file trivial. */
export const MAX_STARS = 1000;

/** The user id becomes part of an object path, so it may not contain anything path-like. */
export function starsName(userId: string): string {
	if (!/^[A-Za-z0-9_-]+$/.test(userId)) throw new Error('invalid user id');
	return `bggcon/stars/${userId}.json`;
}

/** Validate a request body: a list of positive integer BGG ids. Duplicates are dropped. */
export function parseStars(body: unknown): number[] {
	if (!Array.isArray(body)) throw new Error('expected a list of BGG ids');
	if (body.length > MAX_STARS) throw new Error(`at most ${MAX_STARS} stars`);
	for (const id of body) {
		if (typeof id !== 'number' || !Number.isInteger(id) || id <= 0) {
			throw new Error('BGG ids must be positive integers');
		}
	}
	return [...new Set(body as number[])];
}

export async function readStars(userId: string, store: JsonStore = gcsStore): Promise<number[]> {
	return (await store.read<number[]>(starsName(userId))) ?? [];
}

export async function writeStars(userId: string, ids: number[], store: JsonStore = gcsStore): Promise<void> {
	await store.write(starsName(userId), ids);
}
