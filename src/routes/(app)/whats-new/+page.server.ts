import { warehouseClient } from '$lib/server/warehouse';
import type { PageServerLoad } from './$types';

const ALLOWED_DAYS = [7, 30, 365] as const;
type Days = (typeof ALLOWED_DAYS)[number];

function parseDays(value: string | null): Days {
	const n = Number(value);
	return (ALLOWED_DAYS as readonly number[]).includes(n) ? (n as Days) : 7;
}

export const load: PageServerLoad = async ({ url }) => {
	const days = parseDays(url.searchParams.get('days'));
	const games = await warehouseClient().getNewGames(days);
	return { games, days };
};
