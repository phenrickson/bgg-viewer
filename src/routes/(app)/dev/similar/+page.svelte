<script lang="ts">
	/**
	 * Similar-games tuning bench — DEV ONLY.
	 *
	 * Loads two artifacts once: the dev embedding set (`/dev/similar/dataset` — vectors,
	 * playtime, complexity, family/reimplementation links) and the real catalog
	 * (`/api/catalog` — names, mechanics, categories, ratings, weight, players). Neighbour
	 * lists are computed in-browser so every control is instant. Left column is a fixed
	 * baseline (today's prod semantics); right column applies the controls.
	 *
	 * Click a row to walk to that game as the new source; hit its ⟷ to open a feature-level
	 * comparison against the current source. The goal is to decide what a future
	 * `game_neighbors` profile should do; none of this ships.
	 */
	import { onMount, tick } from 'svelte';
	import { tableFromIPC } from 'apache-arrow';
	import { fetchThumbnailMap } from '$lib/catalog/thumbnails';
	import ResultRow from './ResultRow.svelte';
	import ComparePanel from './ComparePanel.svelte';
	import EmbeddingProfile from './EmbeddingProfile.svelte';
	import CompareRuns from './CompareRuns.svelte';
	import { PANEL as PANEL_DEFAULT } from './panel';
	import { rankNeighbors, type RankOpts } from './neighbors';
	import { buildProfilesModule } from './profiles';
	import { buildComparisonHtml, comparisonId } from './comparison-export';
	import { stratified, presets, type GameStat, type StratOpts } from './panelgen';
	import {
		buildReviewHtml,
		parseReview,
		reviewId,
		type ReviewGame,
		type ReviewResult
	} from './review';
	import {
		loadExperiments,
		saveExperiment,
		deleteExperiment,
		loadPanel,
		savePanel,
		loadVerdicts,
		type Params,
		type Experiment,
		type PanelRun,
		type PanelItem,
		type Verdict
	} from './experiments';

	type Status = 'loading' | 'ready' | 'error';
	let status = $state<Status>('loading');
	let errMsg = $state('');

	/** One bag, assigned once. `$state` only so the `$derived` lists recompute when it lands. */
	interface Dataset {
		n: number;
		dim: number;
		ids: Int32Array;
		emb: Float32Array; // flat, L2-normalised — cosine similarity is then a dot product
		cx: Float32Array; // predicted complexity (dev artifact; catalog's is year-scoped)
		minPlaytime: Int32Array;
		maxPlaytime: Int32Array;
		fam: Set<number>[]; // Game:/Series: family ids
		famLabels: string[][];
		rel: Set<number>[]; // reimplementation + expansion links, symmetric
		productLine: Int32Array; // the game's one product-line family id; 0 = none
		// from the catalog, aligned to the same row order:
		names: string[];
		years: Int32Array;
		geek: Float32Array;
		users: Int32Array;
		weight: Float32Array;
		minPlayers: Int32Array;
		maxPlayers: Int32Array;
		mechanics: string[][];
		categories: string[][];
		designers: string[][];
		catFamilies: string[][]; // embedding-relevant families only (see EMBED_FAMILY_RE)
		// derived:
		nameTokens: Set<string>[];
		geekPct: Float32Array; // percentile among rated games, 0..1; -1 = no geek rating
		indexById: Map<number, number>;
	}
	let ds = $state<Dataset | null>(null);
	/** game_id → thumbnail, for the compare panel only. Fire-and-forget; initials otherwise. */
	let thumbById = $state<Map<number, string>>(new Map());

	/**
	 * The only families the game embedding actually uses — `DEFAULT_EMBEDDING_FAMILY_PATTERNS`
	 * in bgg-predictive-models `src/models/embeddings/transformer.py`. Every other family
	 * prefix (Theme:, Series:, Components:, Mechanism:, …) is dropped before the vector is
	 * built, so the compare panel shows only these.
	 */
	const EMBED_FAMILY_RE = /^(Players:|Category|Sports|Traditional|Card|Collectible)/;

	const STOP = new Set([
		'the', 'of', 'and', 'a', 'an', 'to', 'in', 'game', 'games', 'edition', 'deluxe',
		'second', 'first', 'new', 'big', 'box', 'collector', 'collectors', 'special'
	]);
	function tokenize(s: string): Set<string> {
		return new Set(
			s.toLowerCase().split(/[^a-z0-9]+/).filter((t) => t.length >= 3 && !STOP.has(t))
		);
	}

	/* eslint-disable @typescript-eslint/no-explicit-any */
	const asList = (col: any, i: number): string[] => {
		const v = col?.get(i);
		return v ? Array.from(v as Iterable<unknown>, (x) => String(x)) : [];
	};
	const asNum = (col: any, i: number): number => {
		const v = col?.get(i);
		return v == null ? 0 : Number(v);
	};
	/* eslint-enable @typescript-eslint/no-explicit-any */

	onMount(async () => {
		try {
			const [embRes, catRes] = await Promise.all([
				fetch('/dev/similar/dataset'),
				fetch('/api/catalog')
			]);
			if (!embRes.ok) throw new Error(`embedding dataset fetch failed (${embRes.status})`);
			if (!catRes.ok) throw new Error(`catalog fetch failed (${catRes.status})`);

			const embT = tableFromIPC(new Uint8Array(await embRes.arrayBuffer()));
			const catT = tableFromIPC(new Uint8Array(await catRes.arrayBuffer()));

			// Catalog lookup by game_id.
			const catIds = catT.getChild('game_id')!.toArray() as Int32Array;
			const catAt = new Map<number, number>();
			for (let i = 0; i < catT.numRows; i++) catAt.set(catIds[i], i);
			const cName = catT.getChild('name');
			const cYear = catT.getChild('year_published');
			const cGeek = catT.getChild('geek_rating');
			const cUsers = catT.getChild('users_rated');
			const cWeight = catT.getChild('average_weight');
			const cMinP = catT.getChild('min_players');
			const cMaxP = catT.getChild('max_players');
			const cMech = catT.getChild('mechanics');
			const cCats = catT.getChild('categories');
			const cDes = catT.getChild('designers');
			const cFams = catT.getChild('families');

			/* eslint-disable @typescript-eslint/no-explicit-any */
			const embIds = embT.getChild('game_id')!.toArray() as Int32Array;
			const embCx = embT.getChild('complexity')!.toArray() as Float32Array;
			const embMinPt = embT.getChild('min_playtime')!.toArray() as Int32Array;
			const embMaxPt = embT.getChild('max_playtime')!.toArray() as Int32Array;
			const embCol = embT.getChild('embedding') as any;
			const famCol = embT.getChild('family_ids') as any;
			const famLabelCol = embT.getChild('family_labels') as any;
			const relCol = embT.getChild('related_ids') as any;
			const embProdLine = embT.getChild('product_line_id')!.toArray() as Int32Array;
			/* eslint-enable @typescript-eslint/no-explicit-any */

			// Keep only embedding rows that also exist in the catalog (near-total overlap by
			// construction — the dev query matches the catalog's working set).
			const keep: number[] = [];
			for (let o = 0; o < embT.numRows; o++) if (catAt.has(embIds[o])) keep.push(o);
			const n = keep.length;

			const first = embCol.get(keep[0]);
			const dim = first ? first.length : 64;

			const ids = new Int32Array(n);
			const emb = new Float32Array(n * dim);
			const cx = new Float32Array(n);
			const minPlaytime = new Int32Array(n);
			const maxPlaytime = new Int32Array(n);
			const fam: Set<number>[] = new Array(n);
			const famLabels: string[][] = new Array(n);
			const rel: Set<number>[] = new Array(n);
			const productLine = new Int32Array(n);
			const names: string[] = new Array(n);
			const years = new Int32Array(n);
			const geek = new Float32Array(n);
			const users = new Int32Array(n);
			const weight = new Float32Array(n);
			const minPlayers = new Int32Array(n);
			const maxPlayers = new Int32Array(n);
			const mechanics: string[][] = new Array(n);
			const categories: string[][] = new Array(n);
			const designers: string[][] = new Array(n);
			const catFamilies: string[][] = new Array(n);
			const nameTokens: Set<string>[] = new Array(n);
			const indexById = new Map<number, number>();

			for (let i = 0; i < n; i++) {
				const o = keep[i];
				const id = embIds[o];
				ids[i] = id;
				indexById.set(id, i);
				cx[i] = embCx[o];
				minPlaytime[i] = embMinPt[o];
				maxPlaytime[i] = embMaxPt[o];

				const fv = famCol.get(o);
				fam[i] = new Set<number>(fv ? Array.from(fv as Iterable<number>, Number) : []);
				const flv = famLabelCol.get(o);
				famLabels[i] = flv ? Array.from(flv as Iterable<unknown>, String) : [];
				const rv = relCol.get(o);
				rel[i] = new Set<number>(rv ? Array.from(rv as Iterable<number>, Number) : []);
				productLine[i] = embProdLine[o] || 0;

				const ev = embCol.get(o);
				const arr = ev ? (ev.toArray() as Float32Array) : null;
				if (arr) {
					let norm = 0;
					for (let k = 0; k < dim; k++) norm += arr[k] * arr[k];
					norm = Math.sqrt(norm) || 1;
					const b = i * dim;
					for (let k = 0; k < dim; k++) emb[b + k] = arr[k] / norm;
				}

				const c = catAt.get(id)!;
				names[i] = String(cName?.get(c) ?? '');
				years[i] = asNum(cYear, c);
				geek[i] = asNum(cGeek, c);
				users[i] = asNum(cUsers, c);
				weight[i] = asNum(cWeight, c);
				minPlayers[i] = asNum(cMinP, c);
				maxPlayers[i] = asNum(cMaxP, c);
				mechanics[i] = asList(cMech, c);
				categories[i] = asList(cCats, c);
				designers[i] = asList(cDes, c);
				catFamilies[i] = asList(cFams, c).filter((f) => EMBED_FAMILY_RE.test(f));
				nameTokens[i] = tokenize(names[i]);
			}

			// Rating percentile, over games that actually have a geek rating.
			const rated: number[] = [];
			for (let i = 0; i < n; i++) if (geek[i] > 0) rated.push(i);
			rated.sort((a, b) => geek[a] - geek[b]);
			const geekPct = new Float32Array(n).fill(-1);
			const denom = Math.max(1, rated.length - 1);
			for (let r = 0; r < rated.length; r++) geekPct[rated[r]] = r / denom;

			ds = {
				n, dim, ids, emb, cx, minPlaytime, maxPlaytime, fam, famLabels, rel, productLine,
				names, years, geek, users, weight, minPlayers, maxPlayers, mechanics, categories,
				designers, catFamilies, nameTokens, geekPct, indexById
			};

			const urlG = Number(new URLSearchParams(location.search).get('g'));
			sourceId =
				Number.isFinite(urlG) && indexById.has(urlG) ? urlG : indexById.has(181) ? 181 : ids[0];

			status = 'ready';
			experiments = loadExperiments();
			const savedPanel = loadPanel();
			if (savedPanel) {
				panel = [...new Set(savedPanel)];
				panelEdited = true;
			}

			fetchThumbnailMap()
				.then((m) => (thumbById = m))
				.catch((err) => console.error('thumbnail lookup failed (non-fatal)', err));
		} catch (e) {
			errMsg = e instanceof Error ? e.message : String(e);
			status = 'error';
		}
	});

	// --- source game --------------------------------------------------------------------
	let sourceId = $state<number | null>(null);
	let queryStr = $state('');
	let pickerOpen = $state(false);
	let compareId = $state<number | null>(null);

	const srcIdx = $derived(ds && sourceId != null ? ds.indexById.get(sourceId) ?? -1 : -1);

	$effect(() => {
		if (sourceId != null && typeof history !== 'undefined') {
			history.replaceState(history.state, '', `?g=${sourceId}`);
		}
	});

	const matches = $derived.by(() => {
		const q = queryStr.trim().toLowerCase();
		if (q.length < 2 || !ds) return [] as number[];
		const out: number[] = [];
		for (let i = 0; i < ds.n; i++) {
			if (ds.names[i].toLowerCase().includes(q)) out.push(i);
		}
		// Rank by popularity, THEN cap — capping mid-scan drops popular high-id games
		// (rows are in game_id order) before they're ever considered.
		out.sort((a, b) => ds!.users[b] - ds!.users[a]);
		return out.slice(0, 25);
	});

	function pick(id: number) {
		sourceId = id;
		queryStr = '';
		pickerOpen = false;
		compareId = null;
	}

	// --- controls ----------------------------------------------------------------------
	let bandOn = $state(true);
	let band = $state(0.75);
	/** at most N neighbours from any one product line; famCapOn off = keep all */
	let famCapOn = $state(false);
	let famCap = $state(2);
	let excludeTitle = $state(false);
	let minRatingPct = $state(0);
	let minSim = $state(0); // hard cosine-similarity floor, as a percent
	let minUsers = $state(100);
	/** similarity ← → rating. 1 = rank by pure cosine; below 1 adds (1-w)·rating_percentile. */
	let weight = $state(0.8);
	let topK = $state(12);

	/** The fixed reference: today's prod semantics, no cap, rank by pure similarity. */
	function baseline(k: number): RankOpts {
		return {
			minUsers: 100,
			band: 0.75,
			excludeTitle: false,
			minRatingPct: 0,
			minSim: 0,
			weight: 1,
			topK: k,
			maxPerFamily: null
		};
	}

	/** The current control state as a saveable snapshot. */
	const currentParams = $derived<Params>({
		excludeTitle,
		bandOn,
		band,
		minSim,
		minRatingPct,
		minUsers,
		weight,
		topK,
		maxPerFamily: famCapOn ? famCap : null
	});

	const paramsToOpts = (p: Params): RankOpts => ({
		minUsers: p.minUsers,
		band: p.bandOn ? p.band : null,
		excludeTitle: p.excludeTitle,
		minRatingPct: p.minRatingPct,
		minSim: p.minSim,
		weight: p.weight,
		topK: p.topK,
		maxPerFamily: p.maxPerFamily
	});

	const tunedOpts = $derived<RankOpts>(paramsToOpts(currentParams));

	const neighbors = (from: number, o: RankOpts): { idx: number; sim: number }[] =>
		ds && from >= 0 ? rankNeighbors(ds, from, o) : [];

	// --- evaluation: run a parameter set across the whole panel --------------------------
	/** ~n²/panel neighbour math — yield every few sources so the tab stays responsive. */
	async function runExperiment(p: Params): Promise<PanelRun> {
		const out: PanelRun = new Map();
		if (!ds) return out;
		const o = paramsToOpts(p);
		let done = 0;
		for (const sid of panel) {
			const si = ds.indexById.get(sid);
			if (si == null) continue;
			const sFam = ds.fam[si];
			const sRel = ds.rel[si];
			out.set(
				sid,
				neighbors(si, o).map((r) => {
					const i = r.idx;
					const id = ds!.ids[i];
					return {
						id,
						name: ds!.names[i],
						sim: r.sim,
						geek: ds!.geek[i] > 0 ? ds!.geek[i] : null,
						geekPct: ds!.geekPct[i],
						clone:
							sFam.size > 0 && [...ds!.fam[i]].some((f) => sFam.has(f))
								? true
								: sRel.has(id) || ds!.rel[i].has(sid)
					};
				})
			);
			if (++done % 8 === 0) await new Promise((r) => setTimeout(r));
		}
		return out;
	}

	const baseList = $derived(neighbors(srcIdx, baseline(topK)));
	const tunedList = $derived(neighbors(srcIdx, tunedOpts));
	const baseIds = $derived(new Set(baseList.map((r) => ds!.ids[r.idx])));
	const tunedIds = $derived(new Set(tunedList.map((r) => ds!.ids[r.idx])));

	function toRow(r: { idx: number; sim: number }, rank: number, otherIds: Set<number>) {
		const d = ds!;
		const i = r.idx;
		return {
			id: d.ids[i],
			name: d.names[i],
			year: d.years[i] || null,
			sim: r.sim,
			geek: d.geek[i] > 0 ? d.geek[i] : null,
			usersRated: d.users[i],
			complexity: d.cx[i],
			inOther: otherIds.has(d.ids[i]),
			rank
		};
	}

	/**
	 * The tuned candidate set ranked by PURE similarity (same filters, w = 1), id → position.
	 * A tuned row's `shift` is this rank minus its actual rank — how far the rating weight
	 * moved it. All zero when the slider is at pure similarity.
	 */
	const tunedSimRank = $derived.by(() => {
		const m = new Map<number, number>();
		if (!ds || srcIdx < 0) return m;
		const full = neighbors(srcIdx, { ...tunedOpts, weight: 1, topK: Number.MAX_SAFE_INTEGER });
		full.forEach((r, i) => m.set(ds!.ids[r.idx], i + 1));
		return m;
	});

	const baseRows = $derived(ds ? baseList.map((r, k) => toRow(r, k + 1, tunedIds)) : []);
	const tunedRows = $derived(
		ds
			? tunedList.map((r, k) => {
					const row = toRow(r, k + 1, baseIds);
					const sr = tunedSimRank.get(row.id);
					return { ...row, shift: sr != null ? sr - (k + 1) : null };
				})
			: []
	);

	/** Everything the source line and the compare panel need for one game. */
	function gmeta(idx: number) {
		const d = ds!;
		return {
			id: d.ids[idx],
			name: d.names[idx],
			year: d.years[idx] || null,
			geek: d.geek[idx] > 0 ? d.geek[idx] : null,
			weight: d.weight[idx] > 0 ? d.weight[idx] : null,
			complexity: d.cx[idx],
			usersRated: d.users[idx],
			minPlayers: d.minPlayers[idx] || null,
			maxPlayers: d.maxPlayers[idx] || null,
			minPlaytime: d.minPlaytime[idx] || null,
			maxPlaytime: d.maxPlaytime[idx] || null,
			mechanics: d.mechanics[idx],
			categories: d.categories[idx],
			families: d.catFamilies[idx],
			designers: d.designers[idx]
		};
	}

	const src = $derived(ds && srcIdx >= 0 ? gmeta(srcIdx) : null);

	const cmp = $derived.by(() => {
		if (!ds || srcIdx < 0 || compareId == null) return null;
		const ti = ds.indexById.get(compareId);
		if (ti == null) return null;
		const base = srcIdx * ds.dim;
		const b = ti * ds.dim;
		let sim = 0;
		for (let k = 0; k < ds.dim; k++) sim += ds.emb[base + k] * ds.emb[b + k];
		return { a: gmeta(srcIdx), b: gmeta(ti), sim };
	});

	const overlap = $derived(tunedRows.filter((r) => r.inOther).length);
	const pctLabel = $derived(minRatingPct === 0 ? 'off' : `≥ ${minRatingPct}th pct`);

	// --- embedding profile chart (Tune view) -----------------------------------------
	/** Per-component mean / sd over the whole (normalised) embedding set. Computed once. */
	const embStats = $derived.by(() => {
		const d = ds;
		if (!d) return null;
		const { n, dim, emb } = d;
		const mean = new Float32Array(dim);
		for (let i = 0; i < n; i++) {
			const b = i * dim;
			for (let k = 0; k < dim; k++) mean[k] += emb[b + k];
		}
		for (let k = 0; k < dim; k++) mean[k] /= n;
		const std = new Float32Array(dim);
		for (let i = 0; i < n; i++) {
			const b = i * dim;
			for (let k = 0; k < dim; k++) {
				const dv = emb[b + k] - mean[k];
				std[k] += dv * dv;
			}
		}
		for (let k = 0; k < dim; k++) std[k] = Math.sqrt(std[k] / n);
		return { mean, std };
	});

	const profile = $derived.by(() => {
		const d = ds;
		const stats = embStats;
		if (!d || !stats || srcIdx < 0) return null;
		const { dim, emb } = d;
		const slice = (i: number) => emb.subarray(i * dim, i * dim + dim) as Float32Array;
		// pure similarity, no filters — this is about what the embedding says
		const near = neighbors(srcIdx, {
			minUsers: 0,
			band: null,
			excludeTitle: false,
			minRatingPct: 0,
			minSim: 0,
			weight: 1,
			topK: 6,
			maxPerFamily: null
		});
		return {
			dim,
			mean: stats.mean,
			std: stats.std,
			source: { id: d.ids[srcIdx], name: d.names[srcIdx], values: slice(srcIdx) },
			neighbors: near.map((r) => ({
				id: d.ids[r.idx],
				name: d.names[r.idx],
				values: slice(r.idx)
			}))
		};
	});

	// --- experiments / evaluation mode -------------------------------------------------
	let view = $state<'tune' | 'evaluate' | 'outliers'>('tune');
	let experiments = $state<Experiment[]>([]);
	/** the source games every experiment runs over — editable, persisted. */
	let panel = $state<number[]>([...PANEL_DEFAULT]);
	let panelEdited = $state(false);
	let panelQuery = $state('');
	let panelPickerOpen = $state(false);
	let slotA = $state<Experiment | null>(null);
	let slotB = $state<Experiment | null>(null);
	let slotC = $state<Experiment | null>(null);
	let runA = $state<PanelRun | null>(null);
	let runB = $state<PanelRun | null>(null);
	let runC = $state<PanelRun | null>(null);
	let running = $state(false);

	// --- outliers: examine the catalog through the embedding ----------------------------
	/**
	 * Standalone — nothing here touches the bench's experiment controls. One Run button
	 * kicks off a single O(n²) pass (~45 s over ~35 k games), chunked so the tab stays
	 * responsive, that produces three per-game numbers:
	 *
	 *   iso  — 1 − mean cosine similarity to the ISO_K nearest NON-duplicate games
	 *          (reimplementations / expansions / same Game:/Series: family excluded).
	 *          High = even its closest matches are distant.
	 *   dens — how many games sit above cosine DENS_T (same exclusions). High = it's in a
	 *          crowded pocket of near-identical designs.
	 *   cat  — mean cosine similarity to the whole catalog (via the centroid, no
	 *          exclusions). High = a "typical" game; low = extreme in feature space.
	 *
	 * The table then just sorts/filters these instantly.
	 */
	const ISO_K = 25;
	const DENS_T = 0.5;
	let analysis = $state<{ iso: Float32Array; dens: Int32Array; cat: Float32Array } | null>(null);
	let anRunning = $state(false);
	let anProgress = $state(0); // 0..1, share of pairs compared

	async function runAnalysis() {
		const d = ds;
		if (!d || anRunning) return;
		anRunning = true;
		anProgress = 0;
		analysis = null;
		await tick(); // paint the progress UI before the loop blocks

		const { n, dim, emb, rel, fam, ids } = d;
		const top: number[][] = Array.from({ length: n }, () => []);
		const dens = new Int32Array(n);
		const offer = (arr: number[], s: number) => {
			if (arr.length < ISO_K) {
				arr.push(s);
				if (arr.length === ISO_K) arr.sort((x, y) => x - y);
			} else if (s > arr[0]) {
				let p = 0;
				while (p < ISO_K - 1 && s > arr[p + 1]) {
					arr[p] = arr[p + 1];
					p++;
				}
				arr[p] = s;
			}
		};

		// Upper triangle, chunked so the tab stays responsive and the bar moves.
		const CHUNK = 200;
		for (let a = 0; a < n; a += CHUNK) {
			const end = Math.min(a + CHUNK, n);
			for (let i = a; i < end; i++) {
				const bi = i * dim;
				const relI = rel[i];
				const famI = fam[i];
				const idI = ids[i];
				const topI = top[i];
				for (let j = i + 1; j < n; j++) {
					if (relI.has(ids[j]) || rel[j].has(idI)) continue;
					if (famI.size) {
						let shared = false;
						for (const f of fam[j])
							if (famI.has(f)) {
								shared = true;
								break;
							}
						if (shared) continue;
					}
					let s = 0;
					const bj = j * dim;
					for (let k = 0; k < dim; k++) s += emb[bi + k] * emb[bj + k];
					offer(topI, s);
					offer(top[j], s);
					if (s > DENS_T) {
						dens[i]++;
						dens[j]++;
					}
				}
			}
			anProgress = 1 - ((n - end) / n) ** 2; // pairs done, not rows
			await new Promise((r) => setTimeout(r));
		}

		const iso = new Float32Array(n);
		for (let i = 0; i < n; i++) {
			const arr = top[i];
			iso[i] = 1 - (arr.length ? arr.reduce((p, c) => p + c, 0) / arr.length : 0);
		}

		// Mean similarity to the whole catalog = dot(unit vector, centroid). O(n·d), instant.
		const centroid = new Float32Array(dim);
		for (let i = 0; i < n; i++) {
			const b = i * dim;
			for (let k = 0; k < dim; k++) centroid[k] += emb[b + k];
		}
		for (let k = 0; k < dim; k++) centroid[k] /= n;
		const cat = new Float32Array(n);
		for (let i = 0; i < n; i++) {
			const b = i * dim;
			let s = 0;
			for (let k = 0; k < dim; k++) s += emb[b + k] * centroid[k];
			cat[i] = s;
		}

		analysis = { iso, dens, cat };
		anProgress = 1;
		anRunning = false;
	}

	// --- the analysis table ------------------------------------------------------------
	type AnSortKey = 'name' | 'year' | 'iso' | 'dens' | 'cat' | 'geek' | 'cx' | 'users';
	let anMinUsers = $state(100);
	let anSort = $state<AnSortKey>('iso');
	let anDir = $state<1 | -1>(-1); // -1 = descending

	function anSortBy(key: AnSortKey) {
		if (anSort === key) anDir = anDir === 1 ? -1 : 1;
		else {
			anSort = key;
			anDir = key === 'name' ? 1 : -1;
		}
	}

	interface AnRow {
		id: number;
		name: string;
		year: number | null;
		iso: number;
		dens: number;
		cat: number;
		geek: number | null;
		cx: number | null;
		users: number;
	}
	const analysisRows = $derived.by<AnRow[]>(() => {
		const d = ds;
		const a = analysis;
		if (!d || !a || view !== 'outliers') return [];
		const rows: AnRow[] = [];
		for (let i = 0; i < d.n; i++) {
			if (d.users[i] < anMinUsers) continue;
			rows.push({
				id: d.ids[i],
				name: d.names[i],
				year: d.years[i] || null,
				iso: a.iso[i],
				dens: a.dens[i],
				cat: a.cat[i],
				geek: d.geek[i] > 0 ? d.geek[i] : null,
				cx: d.cx[i] || null,
				users: d.users[i]
			});
		}
		const key = anSort;
		const dir = anDir;
		rows.sort((x, y) => {
			let c: number;
			if (key === 'name') c = x.name.localeCompare(y.name);
			else {
				const xv = x[key] ?? -Infinity;
				const yv = y[key] ?? -Infinity;
				c = xv < yv ? -1 : xv > yv ? 1 : 0;
			}
			return c * dir;
		});
		return rows;
	});

	function applyParams(p: Params) {
		excludeTitle = p.excludeTitle;
		bandOn = p.bandOn;
		band = p.band;
		minSim = p.minSim;
		minRatingPct = p.minRatingPct;
		minUsers = p.minUsers;
		weight = p.weight;
		topK = p.topK;
		famCapOn = p.maxPerFamily != null;
		famCap = p.maxPerFamily ?? 2;
	}

	let expName = $state('');
	function saveCurrent() {
		const name = expName.trim() || `exp ${experiments.length + 1}`;
		experiments = saveExperiment(name, currentParams);
		expName = '';
	}
	function removeExperiment(name: string) {
		experiments = deleteExperiment(name);
		if (slotA?.name === name) slotA = null;
		if (slotB?.name === name) slotB = null;
		if (slotC?.name === name) slotC = null;
	}

	/** Toggle an experiment into slot A/B/C — clicking the lit one clears it. */
	function setSlot(slot: 'a' | 'b' | 'c', e: Experiment) {
		if (slot === 'a') slotA = slotA?.name === e.name ? null : e;
		else if (slot === 'b') slotB = slotB?.name === e.name ? null : e;
		else slotC = slotC?.name === e.name ? null : e;
	}

	async function runComparison() {
		if (!slotA || !slotB) return;
		running = true;
		await tick(); // paint "Running…" first
		runA = await runExperiment(slotA.params);
		runB = await runExperiment(slotB.params);
		runC = slotC ? await runExperiment(slotC.params) : null;
		running = false;
	}

	/** The runs currently loaded, in A/B/C order, for CompareRuns + the export. */
	const loadedRuns = $derived(
		runA && runB && slotA && slotB
			? [
					{ name: slotA.name, run: runA },
					{ name: slotB.name, run: runB },
					...(slotC && runC ? [{ name: slotC.name, run: runC }] : [])
				]
			: []
	);

	const REVIEW_TOP = 10;

	/** Bundle the current A-vs-B comparison into a hand-it-to-a-friend HTML file. */
	function exportReview() {
		if (!runA || !runB || !slotA || !slotB || !ds) return;
		const d = ds;
		const year = (id: number) => {
			const i = d.indexById.get(id);
			return i != null && d.years[i] ? d.years[i] : null;
		};
		const toItems = (list: PanelItem[]) =>
			list.slice(0, REVIEW_TOP).map((it) => ({ name: it.name, year: year(it.id) }));
		const games: ReviewGame[] = [];
		for (const sid of runA.keys()) {
			const si = d.indexById.get(sid);
			if (si == null) continue;
			games.push({
				id: sid,
				name: d.names[si],
				year: year(sid),
				listA: toItems(runA.get(sid) ?? []),
				listB: toItems(runB.get(sid) ?? [])
			});
		}
		const spec = { a: slotA.name, b: slotB.name, games };
		const html = buildReviewHtml(spec);
		const url = URL.createObjectURL(new Blob([html], { type: 'text/html' }));
		const a = document.createElement('a');
		// Neutral filename, hashed on the pair + panel so same-day re-exports of different
		// comparisons don't collide (and the same one keeps its name).
		a.href = url;
		a.download = `game-list-review-${reviewId(spec)}.html`;
		a.click();
		URL.revokeObjectURL(url);
	}

	/** Bake the loaded A/B(/C) comparison into a read-only "look at these lists" HTML file. */
	function exportComparison() {
		if (!loadedRuns.length || !ds) return;
		const d = ds;
		const year = (id: number) => {
			const i = d.indexById.get(id);
			return i != null && d.years[i] ? d.years[i] : null;
		};
		const games = [...loadedRuns[0].run.keys()]
			.map((sid) => {
				const si = d.indexById.get(sid);
				return {
					id: sid,
					name: si != null ? d.names[si] : String(sid),
					year: year(sid),
					lists: loadedRuns.map((r) =>
						(r.run.get(sid) ?? [])
							.slice(0, REVIEW_TOP)
							.map((it) => ({ id: it.id, name: it.name, year: year(it.id) }))
					)
				};
			})
			.filter((g) => d.indexById.has(g.id));
		const spec = { experiments: loadedRuns.map((r) => r.name), games };
		const html = buildComparisonHtml(spec);
		const url = URL.createObjectURL(new Blob([html], { type: 'text/html' }));
		const a = document.createElement('a');
		a.href = url;
		a.download = `game-list-comparison-${comparisonId(spec)}.html`;
		a.click();
		URL.revokeObjectURL(url);
	}

	// --- reading a reviewer's answers back in --------------------------------------------
	let reviewPaste = $state('');
	let review = $state<ReviewResult | null>(null);
	let reviewErr = $state('');
	function loadReview() {
		const r = parseReview(reviewPaste);
		if (typeof r === 'string') {
			reviewErr = r;
			review = null;
		} else {
			reviewErr = '';
			review = r;
		}
	}
	const reviewRows = $derived.by(() => {
		if (!review) return [];
		const mine: Record<number, Verdict> =
			slotA && slotB ? loadVerdicts(slotA.name, slotB.name) : {};
		// the bench records ties as 'same', the review file as 'tie' — treat them as one
		const norm = (v: Verdict | 'tie' | null) => (v === 'same' ? 'tie' : v);
		return review.answers.map((ans) => ({
			...ans,
			mine: mine[ans.id] ?? null,
			disagree: mine[ans.id] != null && norm(mine[ans.id]) !== norm(ans.choice)
		}));
	});
	const reviewTally = $derived.by(() => {
		const t = { a: 0, b: 0, tie: 0 };
		for (const r of review?.answers ?? []) t[r.choice]++;
		return t;
	});

	const panelResolved = $derived.by(() => {
		const d = ds;
		return d ? panel.filter((id) => d.indexById.has(id)).length : 0;
	});

	/** Every saved experiment as the text of a Dataform `includes/similarity_profiles.js`. */
	let profilesOpen = $state(false);
	let profilesCopied = $state(false);
	const profilesText = $derived(experiments.length ? buildProfilesModule(experiments) : '');

	async function copyProfiles() {
		try {
			await navigator.clipboard.writeText(profilesText);
			profilesCopied = true;
			setTimeout(() => (profilesCopied = false), 2000);
		} catch {
			profilesOpen = true; // clipboard blocked — fall back to select-all in the box
		}
	}

	function setPanel(ids: number[], edited = true) {
		panel = [...new Set(ids)];
		panelEdited = edited;
		savePanel(edited ? panel : null);
	}
	function addToPanel(id: number) {
		if (!panel.includes(id)) setPanel([...panel, id]);
		panelQuery = '';
		panelPickerOpen = false;
	}
	const removeFromPanel = (id: number) => setPanel(panel.filter((x) => x !== id));
	const resetPanel = () => setPanel([...PANEL_DEFAULT], false);

	// --- panel generators ---
	let genOpen = $state(false);
	let strat = $state<StratOpts>({
		perCell: 3,
		byComplexity: true,
		byRating: true,
		byPopularity: true,
		byYear: false,
		keepHardCases: true
	});
	const gameStats = $derived.by<GameStat[]>(() => {
		const d = ds;
		if (!d) return [];
		const out: GameStat[] = new Array(d.n);
		for (let i = 0; i < d.n; i++)
			out[i] = { id: d.ids[i], cx: d.cx[i], geek: d.geek[i], users: d.users[i], year: d.years[i] };
		return out;
	});
	const genStratified = () => setPanel(stratified(gameStats, strat));

	const panelMatches = $derived.by(() => {
		const q = panelQuery.trim().toLowerCase();
		if (q.length < 2 || !ds) return [] as number[];
		const out: number[] = [];
		for (let i = 0; i < ds.n; i++) {
			if (!panel.includes(ds.ids[i]) && ds.names[i].toLowerCase().includes(q)) out.push(i);
		}
		out.sort((a, b) => ds!.users[b] - ds!.users[a]);
		return out.slice(0, 15);
	});

	// Escape closes the compare dock.
	$effect(() => {
		if (compareId == null) return;
		const onKey = (e: KeyboardEvent) => {
			if (e.key === 'Escape') compareId = null;
		};
		window.addEventListener('keydown', onKey);
		return () => window.removeEventListener('keydown', onKey);
	});
</script>

<svelte:head><title>Similar games — tuning bench (dev)</title></svelte:head>

<div class="wrap">
	<header class="head">
		<p class="eyebrow">Dev only — never built into production</p>
		<h1>Similar games — tuning bench</h1>
		<p class="sub">
			Pick a game, adjust the rules, compare "most similar" against the filtered list — deciding
			what a future <code>game_neighbors</code> profile should do.
		</p>
	</header>

	{#if status === 'loading'}
		<p class="note">Loading embeddings + catalog…</p>
	{:else if status === 'error'}
		<p class="note err">Couldn't load: {errMsg}</p>
	{:else}
		<div class="modes">
			<button class:on={view === 'tune'} onclick={() => (view = 'tune')}>Tune</button>
			<button class:on={view === 'evaluate'} onclick={() => (view = 'evaluate')}>
				Evaluate ({panelResolved})
			</button>
			<button class:on={view === 'outliers'} onclick={() => (view = 'outliers')}>Outliers</button>
		</div>

		{#if view === 'tune'}
		<div class="picker">
			<div class="search">
				<input
					type="text"
					placeholder="Search for a source game…"
					bind:value={queryStr}
					onfocus={() => (pickerOpen = true)}
				/>
				{#if pickerOpen && matches.length && ds}
					<ul class="drop">
						{#each matches as i (ds.ids[i])}
							<li>
								<button onclick={() => pick(ds!.ids[i])}>
									<span>{ds.names[i]} {#if ds.years[i]}<span class="yr">{ds.years[i]}</span>{/if}</span>
									<span class="mut">{ds.users[i].toLocaleString()} ratings</span>
								</button>
							</li>
						{/each}
					</ul>
				{/if}
			</div>
			{#if src}
				<div class="srcline">
					<b>{src.name}</b>
					{#if src.year}<span class="yr">{src.year}</span>{/if}
					<span class="mut">
						· geek {src.geek?.toFixed(2) ?? '—'} · complexity {src.complexity.toFixed(2)} ·
						{src.usersRated.toLocaleString()} ratings · {src.families.length} fam · {src.mechanics.length}
						mech
					</span>
					<a
						class="bgg"
						href="https://boardgamegeek.com/boardgame/{src.id}"
						target="_blank"
						rel="noopener noreferrer">BGG ↗</a
					>
				</div>
			{/if}
		</div>

		{#if cmp}
			<ComparePanel
				a={cmp.a}
				b={cmp.b}
				sim={cmp.sim}
				thumbA={thumbById.get(cmp.a.id) ?? null}
				thumbB={thumbById.get(cmp.b.id) ?? null}
				onclose={() => (compareId = null)}
				onsetsource={() => pick(cmp.b.id)}
			/>
		{/if}
		{/if}

		<div class="grid" class:solo={view === 'outliers'}>
			<aside class="controls">
				<p class="ct">Parameters</p>
				<form class="saverow" onsubmit={(e) => (e.preventDefault(), saveCurrent())}>
					<input
						type="text"
						placeholder="experiment name"
						bind:value={expName}
					/>
					<button type="submit" class="save">Save</button>
				</form>

				<label class="chk">
					<input type="checkbox" bind:checked={excludeTitle} />
					Exclude shared title words
				</label>

				<div class="fld">
					<div class="fh">
						<span>Max per product line</span>
						<label class="mini"><input type="checkbox" bind:checked={famCapOn} /> on</label>
					</div>
					<input type="range" min="0" max="6" step="1" bind:value={famCap} disabled={!famCapOn} />
					<span class="val">
						{famCapOn
							? famCap === 0
								? 'drop every lined game'
								: `≤ ${famCap} per product line`
							: 'keep all'}
					</span>
				</div>

				<div class="fld">
					<div class="fh">
						<span>Complexity band</span>
						<label class="mini"><input type="checkbox" bind:checked={bandOn} /> on</label>
					</div>
					<input type="range" min="0" max="3" step="0.05" bind:value={band} disabled={!bandOn} />
					<span class="val">{bandOn ? `±${band.toFixed(2)}` : 'off'}</span>
				</div>

				<div class="fld">
					<div class="fh"><span>Min similarity</span></div>
					<input type="range" min="0" max="90" step="5" bind:value={minSim} />
					<span class="val">{minSim === 0 ? 'off' : `≥ ${minSim}%`}</span>
				</div>

				<div class="fld">
					<div class="fh"><span>Min rating percentile</span></div>
					<input type="range" min="0" max="95" step="5" bind:value={minRatingPct} />
					<span class="val">{pctLabel}</span>
				</div>

				<div class="fld">
					<div class="fh"><span>Candidate floor (ratings)</span></div>
					<select bind:value={minUsers}>
						<option value={30}>30+</option>
						<option value={100}>100+</option>
						<option value={500}>500+</option>
						<option value={2000}>2,000+</option>
					</select>
				</div>

				<div class="fld">
					<div class="fh"><span>Similarity ← → rating</span></div>
					<input type="range" min="0" max="1" step="0.02" bind:value={weight} />
					<span class="val">
						{#if weight >= 1}
							rank by pure similarity
						{:else}
							{Math.round(weight * 100)}% sim + {Math.round((1 - weight) * 100)}% rating percentile
						{/if}
					</span>
				</div>

				<div class="fld">
					<div class="fh"><span>Show top</span></div>
					<input type="range" min="5" max="50" step="1" bind:value={topK} />
					<span class="val">{topK}</span>
				</div>

				{#if view === 'tune'}
					<p class="ov">{overlap} of {tunedRows.length} shared with baseline</p>
				{/if}
			</aside>

			{#if view === 'tune'}
			<div class="lists">
				<section>
					<p class="lh">Most similar <span class="mut">· baseline: ratings 100+, band ±0.75</span></p>
					{#if baseRows.length}
						<div class="col">
							{#each baseRows as r (r.id)}
								<ResultRow
									row={r}
									active={compareId === r.id}
									onselect={() => pick(r.id)}
									oncompare={() => (compareId = compareId === r.id ? null : r.id)}
								/>
							{/each}
						</div>
					{:else}
						<p class="note">No neighbours.</p>
					{/if}
				</section>
				<section>
					<p class="lh">Tuned <span class="mut">· {tunedRows.length} results</span></p>
					{#if tunedRows.length}
						<div class="col">
							{#each tunedRows as r (r.id)}
								<ResultRow
									row={r}
									shift={r.shift}
									active={compareId === r.id}
									onselect={() => pick(r.id)}
									oncompare={() => (compareId = compareId === r.id ? null : r.id)}
								/>
							{/each}
						</div>
					{:else}
						<p class="note">Nothing clears these filters — loosen the band or the percentile.</p>
					{/if}
				</section>
			</div>
			{:else if view === 'outliers'}
			<div class="analysis">
				<p class="lh">
					Catalog through the embedding
					<span class="mut">· what the similarity structure says about where each game sits</span>
				</p>

				{#if !analysis && !anRunning}
					<p class="note">
						One O(n²) pass over every game pair — about 45s, runs once. Produces three numbers
						per game: <b>isolation</b> (1 − mean similarity to its 25 nearest non-duplicate games),
						<b>density</b> (how many games sit above cosine {DENS_T}), and <b>catalog sim</b> (mean
						similarity to the whole catalog). Nothing here uses the bench's experiment settings.
					</p>
					<button class="run" onclick={runAnalysis}>Run scan</button>
				{:else if anRunning}
					<p class="note">Scanning… {Math.round(anProgress * 100)}%</p>
					<div class="pbar"><span style:width="{anProgress * 100}%"></span></div>
				{:else}
					<div class="anbar">
						<label>
							Min ratings
							<select bind:value={anMinUsers}>
								<option value={0}>off</option>
								<option value={100}>100+</option>
								<option value={500}>500+</option>
								<option value={2000}>2,000+</option>
							</select>
						</label>
						<span class="mut">{analysisRows.length.toLocaleString()} games</span>
						<button class="linkbtn" onclick={runAnalysis}>re-run scan</button>
					</div>
					<div class="tblwrap">
						<table class="antbl">
							<thead>
								<tr>
									<th class="rk">#</th>
									<th><button class:on={anSort === 'name'} onclick={() => anSortBy('name')}>Game</button></th>
									<th class="num"><button class:on={anSort === 'iso'} onclick={() => anSortBy('iso')}>Isolation</button></th>
									<th class="num"><button class:on={anSort === 'dens'} onclick={() => anSortBy('dens')}>Density</button></th>
									<th class="num"><button class:on={anSort === 'cat'} onclick={() => anSortBy('cat')}>Catalog sim</button></th>
									<th class="num"><button class:on={anSort === 'geek'} onclick={() => anSortBy('geek')}>Rating</button></th>
									<th class="num"><button class:on={anSort === 'cx'} onclick={() => anSortBy('cx')}>Cx</button></th>
									<th class="num"><button class:on={anSort === 'users'} onclick={() => anSortBy('users')}>Ratings</button></th>
								</tr>
							</thead>
							<tbody>
								{#each analysisRows as r, i}
									<tr onclick={() => { pick(r.id); view = 'tune'; }}>
										<td class="rk">{i + 1}</td>
										<td>{r.name}{#if r.year} <span class="yr">{r.year}</span>{/if}</td>
										<td class="num">{r.iso.toFixed(3)}</td>
										<td class="num">{r.dens.toLocaleString()}</td>
										<td class="num">{r.cat.toFixed(3)}</td>
										<td class="num">{r.geek?.toFixed(1) ?? '—'}</td>
										<td class="num">{r.cx?.toFixed(1) ?? '—'}</td>
										<td class="num">{r.users.toLocaleString()}</td>
									</tr>
								{/each}
							</tbody>
						</table>
					</div>
				{/if}
			</div>
			{:else}
			<div class="eval">
				<div class="panelbox">
					<p class="lh">
						Panel <span class="mut">· {panel.length} games · runs every experiment over these</span>
						<button class="linkbtn" onclick={() => (genOpen = !genOpen)}>
							{genOpen ? 'hide' : 'generate'}
						</button>
						{#if panelEdited}<button class="linkbtn" onclick={resetPanel}>reset to default</button>{/if}
					</p>

					{#if genOpen}
						<div class="gen">
							<div class="genrow">
								<span class="genl">Stratified</span>
								<label>per cell
									<input type="number" min="1" max="6" bind:value={strat.perCell} />
								</label>
								<label class="cb"><input type="checkbox" bind:checked={strat.byComplexity} /> complexity</label>
								<label class="cb"><input type="checkbox" bind:checked={strat.byRating} /> rating</label>
								<label class="cb"><input type="checkbox" bind:checked={strat.byPopularity} /> popularity</label>
								<label class="cb"><input type="checkbox" bind:checked={strat.byYear} /> year</label>
								<label class="cb"><input type="checkbox" bind:checked={strat.keepHardCases} /> keep hard cases</label>
								<button class="genbtn" onclick={genStratified}>Generate</button>
							</div>
							<div class="genrow">
								<span class="genl">Presets</span>
								<button class="genbtn" onclick={() => setPanel([...PANEL_DEFAULT], false)}>Default</button>
								<button class="genbtn" onclick={() => setPanel(presets.blockbusters(gameStats))}>Blockbusters</button>
								<button class="genbtn" onclick={() => setPanel(presets.wellRatedObscure(gameStats))}>Well-rated &amp; obscure</button>
								<button class="genbtn" onclick={() => setPanel(presets.recent(gameStats))}>Recent (2020+)</button>
							</div>
						</div>
					{/if}

					<div class="psearch">
						<input
							type="text"
							placeholder="Add a game to the panel…"
							bind:value={panelQuery}
							onfocus={() => (panelPickerOpen = true)}
						/>
						{#if panelPickerOpen && panelMatches.length && ds}
							<ul class="drop">
								{#each panelMatches as i (ds.ids[i])}
									<li>
										<button onclick={() => addToPanel(ds!.ids[i])}>
											<span>{ds.names[i]} {#if ds.years[i]}<span class="yr">{ds.years[i]}</span>{/if}</span>
											<span class="mut">{ds.users[i].toLocaleString()} ratings</span>
										</button>
									</li>
								{/each}
							</ul>
						{/if}
					</div>
					<div class="pchips">
						{#each panel as id (id)}
							<span class="pchip" class:missing={ds ? !ds.indexById.has(id) : false}>
								{ds && ds.indexById.has(id) ? ds.names[ds.indexById.get(id)!] : `#${id} (not found)`}
								<button onclick={() => removeFromPanel(id)} aria-label="Remove">✕</button>
							</span>
						{/each}
					</div>
				</div>

				<div class="shelf">
					<p class="lh">
						Experiments <span class="mut">· pick two, then Run</span>
						{#if experiments.length}
							<button
								class="linkbtn"
								onclick={copyProfiles}
								title="Copy all saved experiments as a Dataform similarity_profiles.js"
							>
								{profilesCopied ? 'copied ✓' : 'copy profiles'}
							</button>
							<button class="linkbtn" onclick={() => (profilesOpen = !profilesOpen)}>
								{profilesOpen ? 'hide' : 'show'}
							</button>
						{/if}
					</p>
					{#if profilesOpen}
						<textarea
							class="profilespaste"
							readonly
							rows="12"
							onfocus={(e) => e.currentTarget.select()}
							value={profilesText}
						></textarea>
					{/if}
					{#if !experiments.length}
						<p class="note">
							No saved experiments. Set the parameters, then <b>Save as experiment</b>.
						</p>
					{/if}
					{#each experiments as e (e.name)}
						<div
							class="exp"
							class:a={slotA?.name === e.name}
							class:b={slotB?.name === e.name}
							class:c={slotC?.name === e.name}
						>
							<button class="ename" onclick={() => applyParams(e.params)} title="Load into controls">
								{e.name}
							</button>
							<span class="esum">
								band {e.params.bandOn ? e.params.band.toFixed(2) : 'off'} · {Math.round(
									e.params.weight * 100
								)}/{Math.round((1 - e.params.weight) * 100)} · floor {e.params.minUsers} ·
								{e.params.maxPerFamily != null ? `≤${e.params.maxPerFamily}/line ` : ''}{e.params
									.minSim
									? `sim≥${e.params.minSim} `
									: ''}{e.params.minRatingPct ? `pct≥${e.params.minRatingPct}` : ''}
							</span>
							<div class="pick">
								<button class:on={slotA?.name === e.name} onclick={() => setSlot('a', e)}>A</button>
								<button class:on={slotB?.name === e.name} onclick={() => setSlot('b', e)}>B</button>
								<button class:on={slotC?.name === e.name} onclick={() => setSlot('c', e)}>C</button>
								<button class="del" onclick={() => removeExperiment(e.name)} aria-label="Delete">✕</button>
							</div>
						</div>
					{/each}
					<div class="runrow">
						<button
							class="run"
							disabled={!slotA ||
								!slotB ||
								running ||
								new Set([slotA?.name, slotB?.name, slotC?.name].filter(Boolean)).size <
									[slotA, slotB, slotC].filter(Boolean).length}
							onclick={runComparison}
						>
							{running
								? 'Running…'
								: `Run ${[slotA?.name ?? 'A', slotB?.name ?? 'B', slotC?.name].filter(Boolean).join(' · ')}`}
						</button>
						{#if loadedRuns.length}
							<button
								class="genbtn"
								onclick={exportComparison}
								title="Read-only HTML snapshot of these lists side by side"
							>
								Export comparison
							</button>
						{/if}
						{#if runA && runB && slotA && slotB}
							<button class="genbtn" onclick={exportReview} title="Bundle this comparison into a blind A/B HTML file to send someone">
								Export review file
							</button>
						{/if}
					</div>
				</div>

				{#if loadedRuns.length}
					<CompareRuns
						runs={loadedRuns}
						nameOf={(id) => (ds ? ds.names[ds.indexById.get(id) ?? -1] ?? String(id) : String(id))}
						onpick={(id) => {
							pick(id);
							view = 'tune';
						}}
					/>

					{#if slotA && slotB}
					<details class="reviewbox">
						<summary>Load a reviewer's answers</summary>
						<textarea
							class="reviewpaste"
							placeholder="Paste the JSON block the reviewer sent back…"
							bind:value={reviewPaste}
						></textarea>
						<div class="reviewrow">
							<button class="genbtn" onclick={loadReview} disabled={!reviewPaste.trim()}>Load</button>
							{#if reviewErr}<span class="rerr">{reviewErr}</span>{/if}
						</div>

						{#if review}
							{#if review.a !== slotA.name || review.b !== slotB.name}
								<p class="rerr">
									This review was for <b>{review.a}</b> vs <b>{review.b}</b> — not the pair loaded above.
								</p>
							{/if}
							<p class="rtally">
								{review.answers.length} answered ·
								<b>{review.a}</b> better {reviewTally.a} · tie {reviewTally.tie} ·
								<b>{review.b}</b> better {reviewTally.b}
							</p>
							<div class="rtbl">
								{#each reviewRows as r (r.id)}
									<div class="rr" class:dis={r.disagree}>
										<button
											class="rgame"
											onclick={() => {
												pick(r.id);
												view = 'tune';
											}}>{ds ? ds.names[ds.indexById.get(r.id) ?? -1] ?? r.name : r.name}</button
										>
										<span class="rc rc-{r.choice}">
											{r.choice === 'tie' ? 'tie' : r.choice === 'a' ? review.a : review.b}
										</span>
										<span class="rmine">
											{#if r.mine}you: {r.mine === 'a' ? review.a : r.mine === 'b' ? review.b : 'tie'}{/if}
										</span>
										{#if r.note}<span class="rnote">“{r.note}”</span>{/if}
									</div>
								{/each}
							</div>
						{/if}
					</details>
					{/if}
				{/if}
			</div>
			{/if}
		</div>

		{#if view === 'tune' && profile}
			<EmbeddingProfile
				dim={profile.dim}
				source={profile.source}
				neighbors={profile.neighbors}
				mean={profile.mean}
				std={profile.std}
				onpick={(id) => pick(id)}
			/>
		{/if}
	{/if}
</div>

<style>
	.wrap {
		max-width: 78rem;
		margin: 0 auto;
		padding: var(--space-lg) var(--space-md) 6rem;
	}
	.head {
		border-bottom: 1px solid var(--border);
		padding-bottom: var(--space-md);
		margin-bottom: var(--space-lg);
	}
	.eyebrow {
		font-size: 0.72rem;
		text-transform: uppercase;
		letter-spacing: 0.06em;
		color: var(--muted-foreground);
		font-weight: 600;
		margin: 0 0 0.35rem;
	}
	h1 {
		font-size: clamp(1.4rem, 1.1rem + 1vw, 2rem);
		font-weight: 750;
		margin: 0;
	}
	.sub {
		font-size: 0.9rem;
		color: var(--muted-foreground);
		margin: 0.4rem 0 0;
	}
	code {
		font-size: 0.85em;
	}
	.note {
		color: var(--muted-foreground);
		font-size: 0.85rem;
		padding: var(--space-md) 0;
	}
	.note.err {
		color: var(--destructive, oklch(0.6 0.2 25));
	}

	/* mode switch */
	.modes {
		display: flex;
		gap: 0.3rem;
		margin-bottom: var(--space-md);
	}
	.modes button {
		font: inherit;
		font-size: 0.8rem;
		font-weight: 600;
		padding: 0.3rem 0.8rem;
		border: 1px solid var(--border);
		border-radius: 999px;
		background: var(--background);
		color: var(--muted-foreground);
		cursor: pointer;
	}
	.modes button.on {
		border-color: var(--primary);
		background: color-mix(in oklch, var(--primary) 12%, transparent);
		color: var(--foreground);
	}

	.saverow {
		display: flex;
		gap: 0.3rem;
		margin: -0.2rem 0 0.2rem;
	}
	.saverow input {
		flex: 1;
		min-width: 0;
		font: inherit;
		font-size: 0.76rem;
		padding: 0.25rem 0.45rem;
		border: 1px solid var(--border);
		border-radius: 6px;
		background: var(--background);
		color: var(--foreground);
	}
	.save {
		flex: none;
		font: inherit;
		font-size: 0.76rem;
		padding: 0.25rem 0.6rem;
		border: 1px solid var(--primary);
		border-radius: 6px;
		background: color-mix(in oklch, var(--primary) 10%, transparent);
		color: var(--primary);
		cursor: pointer;
	}

	/* evaluate view */
	.eval {
		min-width: 0;
		display: flex;
		flex-direction: column;
		gap: var(--space-md);
	}
	.linkbtn {
		font: inherit;
		font-size: 0.72rem;
		background: none;
		border: none;
		color: var(--primary);
		cursor: pointer;
		padding: 0;
		margin-left: 0.4rem;
	}
	.linkbtn:hover {
		text-decoration: underline;
	}
	.panelbox {
		border: 1px solid var(--border);
		border-radius: var(--radius);
		padding: var(--space-md);
	}
	.gen {
		display: flex;
		flex-direction: column;
		gap: 0.4rem;
		margin: 0.4rem 0 0.2rem;
		padding: 0.5rem;
		border: 1px solid var(--border);
		border-radius: 8px;
		background: var(--background);
	}
	.genrow {
		display: flex;
		flex-wrap: wrap;
		align-items: center;
		gap: 0.5rem;
		font-size: 0.74rem;
	}
	.genl {
		font-weight: 650;
		width: 4.5rem;
		flex: none;
		color: var(--muted-foreground);
		text-transform: uppercase;
		letter-spacing: 0.03em;
		font-size: 0.66rem;
	}
	.genrow label {
		display: inline-flex;
		align-items: center;
		gap: 0.25rem;
	}
	.genrow input[type='number'] {
		width: 2.6rem;
		font: inherit;
		font-size: 0.74rem;
		padding: 0.1rem 0.25rem;
		border: 1px solid var(--border);
		border-radius: 4px;
		background: var(--card);
		color: var(--foreground);
	}
	.genbtn {
		font: inherit;
		font-size: 0.72rem;
		padding: 0.2rem 0.55rem;
		border: 1px solid var(--border);
		border-radius: 6px;
		background: var(--card);
		color: var(--foreground);
		cursor: pointer;
	}
	.genbtn:hover {
		border-color: var(--primary);
		color: var(--primary);
	}
	.psearch {
		position: relative;
		max-width: 24rem;
		margin: 0.3rem 0 0.5rem;
	}
	.psearch input {
		width: 100%;
		font: inherit;
		font-size: 0.8rem;
		padding: 0.35rem 0.55rem;
		border: 1px solid var(--border);
		border-radius: 6px;
		background: var(--background);
		color: var(--foreground);
	}
	.pchips {
		display: flex;
		flex-wrap: wrap;
		gap: 0.3rem;
		max-height: 9rem;
		overflow-y: auto;
	}
	.pchip {
		display: inline-flex;
		align-items: center;
		gap: 0.3rem;
		font-size: 0.72rem;
		padding: 0.1rem 0.2rem 0.1rem 0.5rem;
		border-radius: 999px;
		border: 1px solid var(--border);
		background: var(--background);
		color: var(--muted-foreground);
	}
	.pchip.missing {
		border-color: var(--color-negative);
		color: var(--color-negative);
	}
	.pchip button {
		font: inherit;
		font-size: 0.7rem;
		border: none;
		background: none;
		color: inherit;
		cursor: pointer;
		opacity: 0.6;
		line-height: 1;
		padding: 0.1rem 0.2rem;
	}
	.pchip button:hover {
		opacity: 1;
	}
	.shelf {
		display: flex;
		flex-direction: column;
		gap: 0.4rem;
	}
	.exp {
		display: grid;
		grid-template-columns: 9rem 1fr auto;
		gap: 0.5rem;
		align-items: center;
		padding: 0.4rem 0.5rem;
		border: 1px solid var(--border);
		border-radius: 8px;
		background: var(--background);
	}
	.exp.a {
		border-color: var(--chart-1, oklch(0.62 0.19 250));
	}
	.exp.b {
		border-color: var(--chart-2, oklch(0.68 0.17 40));
	}
	.exp.c {
		border-color: oklch(0.68 0.15 150);
	}
	.ename {
		font: inherit;
		font-weight: 650;
		font-size: 0.82rem;
		text-align: left;
		background: none;
		border: none;
		color: var(--primary);
		cursor: pointer;
		padding: 0;
		overflow: hidden;
		text-overflow: ellipsis;
	}
	.ename:hover {
		text-decoration: underline;
	}
	.esum {
		font-size: 0.68rem;
		color: var(--muted-foreground);
		font-variant-numeric: tabular-nums;
		overflow: hidden;
		text-overflow: ellipsis;
		white-space: nowrap;
	}
	.pick {
		display: flex;
		gap: 0.2rem;
	}
	.pick button {
		font: inherit;
		font-size: 0.72rem;
		width: 1.5rem;
		height: 1.5rem;
		border: 1px solid var(--border);
		border-radius: 4px;
		background: var(--background);
		color: var(--muted-foreground);
		cursor: pointer;
	}
	.pick button.on {
		border-color: var(--primary);
		background: color-mix(in oklch, var(--primary) 15%, transparent);
		color: var(--foreground);
		font-weight: 700;
	}
	.pick .del:hover {
		border-color: var(--color-negative);
		color: var(--color-negative);
	}
	.run {
		margin-top: 0.4rem;
		font: inherit;
		font-size: 0.82rem;
		font-weight: 600;
		padding: 0.4rem 0.8rem;
		border: 1px solid var(--primary);
		border-radius: 8px;
		background: var(--primary);
		color: oklch(0.99 0 0);
		cursor: pointer;
	}
	.run:disabled {
		opacity: 0.45;
		cursor: not-allowed;
	}
	.runrow {
		display: flex;
		align-items: center;
		gap: 0.5rem;
		flex-wrap: wrap;
	}

	.reviewbox {
		margin-top: var(--space-md);
		border: 1px solid var(--border);
		border-radius: var(--radius);
		padding: var(--space-md);
		font-size: 0.82rem;
	}
	.reviewbox summary {
		cursor: pointer;
		font-weight: 600;
		color: var(--muted-foreground);
	}
	.reviewpaste,
	.profilespaste {
		width: 100%;
		min-height: 4rem;
		margin-top: 0.6rem;
		font: 0.75rem/1.4 ui-monospace, monospace;
		padding: 0.5rem;
		border: 1px solid var(--border);
		border-radius: 6px;
		background: var(--background);
		color: var(--foreground);
		resize: vertical;
	}
	.reviewrow {
		display: flex;
		align-items: center;
		gap: 0.6rem;
		margin-top: 0.4rem;
	}
	.rerr {
		color: var(--color-negative);
		font-size: 0.78rem;
	}
	.rtally {
		margin: 0.7rem 0 0.4rem;
		color: var(--muted-foreground);
	}
	.rtally b {
		color: var(--foreground);
	}
	.rtbl {
		display: flex;
		flex-direction: column;
		border: 1px solid var(--border);
		border-radius: 8px;
		overflow: hidden;
	}
	.rr {
		display: grid;
		grid-template-columns: minmax(0, 1fr) 8rem 8rem minmax(0, 1.4fr);
		gap: 0.5rem;
		align-items: baseline;
		padding: 0.35rem 0.55rem;
		border-top: 1px solid var(--border);
		font-size: 0.78rem;
	}
	.rr:first-child {
		border-top: none;
	}
	.rr.dis {
		background: color-mix(in oklch, var(--color-negative) 8%, transparent);
	}
	.rgame {
		font: inherit;
		text-align: left;
		background: none;
		border: none;
		color: var(--primary);
		cursor: pointer;
		padding: 0;
		overflow: hidden;
		text-overflow: ellipsis;
		white-space: nowrap;
	}
	.rgame:hover {
		text-decoration: underline;
	}
	.rc {
		font-weight: 650;
		white-space: nowrap;
		overflow: hidden;
		text-overflow: ellipsis;
	}
	.rc-tie {
		color: var(--muted-foreground);
	}
	.rmine {
		color: var(--muted-foreground);
		white-space: nowrap;
		overflow: hidden;
		text-overflow: ellipsis;
	}
	.rnote {
		color: var(--muted-foreground);
		font-style: italic;
		min-width: 0;
	}
	@media (max-width: 720px) {
		.rr {
			grid-template-columns: 1fr 1fr;
		}
	}

	.picker {
		margin-bottom: var(--space-lg);
		display: flex;
		flex-direction: column;
		gap: 0.5rem;
	}
	.search {
		position: relative;
		max-width: 30rem;
	}
	.search input {
		width: 100%;
		padding: 0.5rem 0.7rem;
		border: 1px solid var(--border);
		border-radius: 8px;
		background: var(--background);
		color: var(--foreground);
		font: inherit;
	}
	.drop {
		position: absolute;
		z-index: 30;
		top: calc(100% + 0.25rem);
		left: 0;
		right: 0;
		margin: 0;
		padding: 0.25rem;
		list-style: none;
		max-height: 20rem;
		overflow-y: auto;
		background: var(--card);
		border: 1px solid var(--border);
		border-radius: 8px;
		box-shadow: 0 8px 24px oklch(0 0 0 / 0.28);
	}
	.drop button {
		display: flex;
		justify-content: space-between;
		gap: 1rem;
		width: 100%;
		padding: 0.4rem 0.5rem;
		border: none;
		background: none;
		text-align: left;
		font: inherit;
		color: inherit;
		border-radius: 6px;
		cursor: pointer;
	}
	.drop button:hover {
		background: color-mix(in oklch, var(--primary) 10%, transparent);
	}
	.srcline {
		font-size: 0.86rem;
		display: flex;
		align-items: baseline;
		gap: 0.4rem;
		flex-wrap: wrap;
	}
	.srcline b {
		font-weight: 700;
	}
	.yr {
		color: var(--muted-foreground);
		font-weight: 400;
	}
	.mut {
		color: var(--muted-foreground);
		font-size: 0.9em;
	}
	.bgg {
		color: var(--primary);
		text-decoration: none;
	}

	.grid {
		display: grid;
		grid-template-columns: 16rem minmax(0, 1fr);
		gap: var(--space-lg);
		align-items: start;
	}
	@media (max-width: 860px) {
		.grid {
			grid-template-columns: 1fr;
		}
	}

	.controls {
		position: sticky;
		top: var(--space-md);
		display: flex;
		flex-direction: column;
		gap: 0.7rem;
		padding: var(--space-md);
		border: 1px solid var(--border);
		border-radius: var(--radius);
		background: var(--card);
	}
	.ct {
		font-size: 0.7rem;
		text-transform: uppercase;
		letter-spacing: 0.06em;
		color: var(--muted-foreground);
		font-weight: 600;
		margin: 0;
	}
	.chk {
		display: flex;
		align-items: center;
		gap: 0.45rem;
		font-size: 0.82rem;
	}
	.fld {
		display: flex;
		flex-direction: column;
		gap: 0.25rem;
	}
	.fh {
		display: flex;
		justify-content: space-between;
		align-items: center;
		font-size: 0.78rem;
		font-weight: 600;
	}
	.mini {
		font-size: 0.72rem;
		font-weight: 400;
		color: var(--muted-foreground);
		display: inline-flex;
		align-items: center;
		gap: 0.25rem;
	}
	.fld input[type='range'] {
		width: 100%;
		accent-color: var(--primary);
	}
	.fld select {
		padding: 0.3rem 0.4rem;
		border: 1px solid var(--border);
		border-radius: 6px;
		background: var(--background);
		color: var(--foreground);
		font: inherit;
		font-size: 0.82rem;
	}
	.val {
		font-size: 0.72rem;
		color: var(--muted-foreground);
		font-variant-numeric: tabular-nums;
	}
	.ov {
		font-size: 0.72rem;
		color: var(--muted-foreground);
		margin: 0.2rem 0 0;
		border-top: 1px solid var(--border);
		padding-top: 0.5rem;
	}

	.lists {
		display: grid;
		grid-template-columns: minmax(0, 1fr) minmax(0, 1fr);
		gap: var(--space-lg);
	}
	@media (max-width: 1100px) {
		.lists {
			grid-template-columns: minmax(0, 1fr);
		}
	}
	.lists > section {
		min-width: 0;
	}
	.lh {
		font-size: 0.78rem;
		font-weight: 700;
		margin: 0 0 0.5rem;
	}
	.col {
		display: flex;
		flex-direction: column;
		gap: 0.3rem;
		min-width: 0;
	}

	/* outliers / analysis view — its own full-width layout, no bench controls */
	.grid.solo {
		grid-template-columns: 1fr;
	}
	.grid.solo .controls {
		display: none;
	}
	.analysis {
		min-width: 0;
	}
	.pbar {
		height: 6px;
		border-radius: 999px;
		background: var(--muted);
		overflow: hidden;
		max-width: 30rem;
	}
	.pbar span {
		display: block;
		height: 100%;
		background: var(--primary);
		transition: width 0.2s linear;
	}
	.anbar {
		display: flex;
		align-items: center;
		gap: 1rem;
		margin: 0.6rem 0;
		font-size: 0.78rem;
	}
	.anbar label {
		display: inline-flex;
		align-items: center;
		gap: 0.4rem;
	}
	.anbar select {
		font: inherit;
		font-size: 0.78rem;
		padding: 0.15rem 0.3rem;
		border: 1px solid var(--border);
		border-radius: 6px;
		background: var(--background);
		color: var(--foreground);
	}
	.tblwrap {
		max-height: 42rem;
		overflow: auto;
		border: 1px solid var(--border);
		border-radius: var(--radius);
	}
	.antbl {
		width: 100%;
		border-collapse: collapse;
		font-size: 0.78rem;
		font-variant-numeric: tabular-nums;
	}
	.antbl thead th {
		position: sticky;
		top: 0;
		background: var(--muted);
		text-align: left;
		font-weight: 600;
		white-space: nowrap;
		z-index: 1;
	}
	.antbl th button {
		font: inherit;
		font-weight: 600;
		background: none;
		border: none;
		color: var(--muted-foreground);
		cursor: pointer;
		padding: 0.4rem 0.6rem;
		width: 100%;
		text-align: inherit;
	}
	.antbl th.num button {
		text-align: right;
	}
	.antbl th button.on {
		color: var(--primary);
	}
	.antbl td {
		padding: 0.3rem 0.6rem;
		border-top: 1px solid var(--border);
		white-space: nowrap;
		overflow: hidden;
		text-overflow: ellipsis;
		max-width: 22rem;
	}
	.antbl td.num {
		text-align: right;
	}
	.antbl td.rk,
	.antbl th.rk {
		text-align: right;
		color: var(--muted-foreground);
		width: 3.5rem;
	}
	.antbl tbody tr {
		cursor: pointer;
	}
	.antbl tbody tr:hover {
		background: color-mix(in oklch, var(--primary) 8%, transparent);
	}
</style>
