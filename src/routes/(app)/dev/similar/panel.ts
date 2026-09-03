/**
 * The fixed evaluation panel — the set of source games every experiment runs against.
 * Held constant so two parameter sets produce comparable results.
 *
 * Seeded from a stratified sample of `game_similarity_search` (3 buckets each of
 * complexity × geek rating × popularity, plus unrated/upcoming) and a hand-picked set of
 * hard cases. Add IDs over time as configs break in interesting ways — keep it stable
 * otherwise.
 */
/** Always-in games — clone-heavy, niche, party, blockbuster — kept across regenerations. */
export const HARD_CASES: number[] = [
	13, // Catan
	9209, // Ticket to Ride
	822, // Carcassonne
	30549, // Pandemic
	266192, // Wingspan
	233078, // Twilight Imperium: Fourth Edition
	178900, // Codenames
	174430, // Gloomhaven
	224517, // Brass: Birmingham
	68448, // 7 Wonders
	230802, // Azul
	162886, // Spirit Island
	237182, // Root
	181 // Risk
];

/**
 * Deterministic id-hash shuffle (FNV-ish). The authored list below is grouped
 * blockbusters-first, then heavy→medium→light — which makes every downstream view
 * (CompareRuns, the review file, the panel chips) front-load popular games. Ordering
 * by a hash of the id breaks that up while staying stable across reloads.
 */
function shuffleIds(ids: number[]): number[] {
	const h = (n: number) => {
		let x = 2166136261 ^ n;
		x = Math.imul(x ^ (x >>> 16), 2246822507);
		x = Math.imul(x ^ (x >>> 13), 3266489909);
		return (x ^ (x >>> 16)) >>> 0;
	};
	return [...ids].sort((a, b) => h(a) - h(b));
}

export const PANEL: number[] = shuffleIds([
	...new Set<number>([
	...HARD_CASES,

	// --- heavy ---
	270633, 308119, 356080, 1, 200680, 343905, // high-rated
	283, 131449, 277080, 12234, 227847, 426713, // low-rated
	3307, 130960, 220588, 62227, 142379, 192457, // mid-rated
	408565, 465466, 466429, // unrated / upcoming

	// --- medium ---
	251219, 332398, 332800, 103885, 233371, 244521, // high-rated
	982, 34615, 164865, 1436, 204143, 240143, // low-rated
	181, 815, 2386, // low-rated, popular (Risk lives here)
	218920, 220827, 266121, 181289, 177639, 204305, 244115, // mid-rated
	436585, 455544, 473376, // unrated / upcoming

	// --- light ---
	230914, 274638, 521, 129622, 156546, // high-rated
	185, 403, 309129, 211, 89767, 413605, // low-rated
	2375, 172242, 234190, // low-rated, popular
	267475, 354886, 456440, 134253, 251678, 256952, // mid-rated
	461838, 471487, 471664 // unrated / upcoming
	])
]);
