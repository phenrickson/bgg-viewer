/**
 * Phil's BGG.CON focus list: starred BGG ids, saved per user in the bucket via
 * `/api/bggcon/stars` so the laptop and the phone agree. One store; every star button uses it.
 *
 * A tap shows at once and saves in the background, one save at a time and in order. If a save
 * fails, the list goes back to what the server last confirmed and `error` says so.
 */
type Fetch = (url: string, init?: RequestInit) => Promise<Response>;

const URL = '/api/bggcon/stars';

export function createStars(f: Fetch) {
	let ids = $state<number[]>([]);
	let error = $state<string | null>(null);
	let loaded = $state(false);
	/** What the server last confirmed; the list falls back to this when a save fails. */
	let confirmed: number[] = [];
	let chain: Promise<void> = Promise.resolve();

	async function load(): Promise<void> {
		const res = await f(URL);
		if (!res.ok) throw new Error(`stars request failed (${res.status})`);
		ids = confirmed = (await res.json()) as number[];
		loaded = true;
	}

	async function save(next: number[]): Promise<void> {
		try {
			const res = await f(URL, {
				method: 'PUT',
				headers: { 'content-type': 'application/json' },
				body: JSON.stringify(next)
			});
			if (!res.ok) throw new Error(String(res.status));
			confirmed = next;
			error = null;
		} catch {
			ids = confirmed;
			error = 'Couldn’t save your focus list. Try again.'; // PLACEHOLDER copy (Phil)
		}
	}

	function toggle(id: number): Promise<void> {
		const next = ids.includes(id) ? ids.filter((x) => x !== id) : [...ids, id];
		ids = next;
		return (chain = chain.then(() => save(next)));
	}

	return {
		load,
		toggle,
		has: (id: number) => ids.includes(id),
		get ids() {
			return ids;
		},
		get count() {
			return ids.length;
		},
		get error() {
			return error;
		},
		get loaded() {
			return loaded;
		}
	};
}

export const stars = createStars((url, init) => fetch(url, init));
