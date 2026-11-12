# Game Genealogy Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** A dev-only `/dev/genealogy` page that shows one game's family tree over the embedding — earlier similar games above, later ones below, same-year ones beside it — grown by unfolding games in place.

**Architecture:** A pure core (`genealogy.ts`: threshold scan + tree build; `genealogy-layout.ts`: positions + geometry; `genealogy-url.ts`: URL state) feeds a new `GenealogyLayer` on the existing regl `PointCanvas`, a sibling of `NetworkLayer`. Vectors come from the dev similarity dataset, which gains an `embedding_version` stamp so the page can refuse a dataset and coordinates artifact from different embedding runs. Everything is computed in the browser; all tree state lives in the URL.

**Tech Stack:** SvelteKit 2 + Svelte 5 runes, TypeScript, apache-arrow, regl-scatterplot (via `PointCanvas`), vitest.

**Spec:** `docs/superpowers/specs/2026-10-12-game-genealogy-design.md`

## Global Constraints

- Branch `feat/game-lineage` (already exists and is pushed); one PR to `main` carrying spec, plan and code. Phil merges — never `gh pr merge`.
- Before every `git push`: `gh pr view --json state,mergedAt` (once a PR exists) — never push to a merged branch.
- Commit and push each task as soon as its tests pass.
- Commit subjects: `type(scope): …`, scope `genealogy` (or `similar` for the dataset change), ending with the trailer `Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>`.
- Page is dev-gated: `if (!dev) error(404)` in `+page.server.ts`.
- All visible copy is PLACEHOLDER — Phil writes copy. Mark it once in the page's header comment; never treat copy as a blocker.
- Reuse house components (`SegGroup`, `Button`, `GameSearch`); no hand-rolled equivalents.
- `.ts` files indent with tabs; `.svelte` files indent with two spaces (match neighbours).
- Never start a dev server in the background. Phil reviews UI on his own `just dev`.
- Do not run BigQuery, `gcloud`, or cache-clearing commands without asking Phil first.
- Unit tests: `pnpm vitest run <file>`; types: `pnpm run check`; before the PR: `just verify`.

## Review Focus

1. **Centre with no year or no vector** (e.g. a URL naming a year-0 game) → a plain "can't be placed in time" message, not a blank canvas or a throw. Pinned in Task 2 (`placeable` tests) and handled in Task 7.
2. **Threshold dragged very low** → every unfold, *including the centre's same-year row*, still shows at most `cap` games plus a "+N more" count. Pinned in Task 2 (contemporaries cap test).
3. **Stale ids in the URL** (unfolded/expanded ids no longer in the tree after a threshold move or a hand-edited URL) → ignored silently, tree identical to one without them. Pinned in Task 2 and Task 5.
4. **BC and year-0 years** — Go (−2200) must sort as an ancestor of a 1990 game; year 0 means unknown and never appears. Pinned in Task 2.
5. **Dataset and coordinates from different embedding runs, or a dataset cached before version stamping** → a clear error naming the fix (`just similar-rebuild`), never a silently partial tree. Pinned in Task 3.

---

## File Structure

| File | Status | Responsibility |
|---|---|---|
| `src/lib/server/similar-explorer/serialize.ts` | modify | stamp `embedding_version` / `embedding_model` into Arrow schema metadata |
| `src/lib/server/similar-explorer/build.ts` | modify | select the two version columns |
| `src/lib/server/similar-explorer/serialize.test.ts` | create | metadata + mixed-version tests |
| `src/lib/map/network-data.ts` | modify | extract `alignVectors` so genealogy reuses it |
| `src/lib/map/genealogy-data.ts` | create | parse the dataset into `GenealogyInput`; version check |
| `src/lib/map/genealogy-data.test.ts` | create | |
| `src/lib/map/genealogy.ts` | create | `linked`, `linkKind`, `placeable`, `buildGenealogy` |
| `src/lib/map/genealogy.test.ts` | create | |
| `src/lib/map/genealogy-layout.ts` | create | `layoutGenealogy`, ticks, `ndcToScreen`, `dashed`, `offset` |
| `src/lib/map/genealogy-layout.test.ts` | create | |
| `src/lib/map/genealogy-url.ts` | create | `fromParams` / `toParams`, defaults |
| `src/lib/map/genealogy-url.test.ts` | create | |
| `src/lib/map/GenealogyLayer.svelte` | create | the regl layer: points, edges, overlay, ⊕ / +N buttons, legend |
| `src/lib/catalog/GameSearch.svelte` | modify | optional `onpick` prop instead of navigating |
| `src/routes/(app)/dev/genealogy/+page.server.ts` | create | dev gate |
| `src/routes/(app)/dev/genealogy/+page.svelte` | create | page: load, controls, URL, breadcrumb, side panel |

---

### Task 1: Stamp the dev similarity dataset with its embedding version

**Files:**
- Modify: `src/lib/server/similar-explorer/serialize.ts`
- Modify: `src/lib/server/similar-explorer/build.ts` (the final `SELECT` in `querySql`)
- Test: `src/lib/server/similar-explorer/serialize.test.ts`

**Interfaces:**
- Produces: the artifact's schema metadata carries `embedding_version` (string of an integer) and `embedding_model`; exported consts `META_VERSION = 'embedding_version'`, `META_MODEL = 'embedding_model'`. `rowsToArrowIPC(rows)` throws if rows span more than one version or model.

- [ ] **Step 1: Write the failing test**

```ts
// src/lib/server/similar-explorer/serialize.test.ts
import { describe, it, expect } from 'vitest';
import { tableFromIPC } from 'apache-arrow';
import { rowsToArrowIPC, META_VERSION, META_MODEL } from './serialize';

const row = (game_id: number, v: unknown = { value: '6' }, m = 'embeddings-v2026') => ({
	game_id,
	complexity: 2.5,
	min_playtime: 30,
	max_playtime: 60,
	embedding: [1, 0],
	family_ids: [{ value: '7' }],
	family_labels: ['Game: X'],
	related_ids: [],
	product_line_id: null,
	embedding_version: v,
	embedding_model: m
});

describe('rowsToArrowIPC', () => {
	it('stamps the embedding version and model into the schema metadata', () => {
		const t = tableFromIPC(rowsToArrowIPC([row(1), row(2)]));
		expect(t.schema.metadata.get(META_VERSION)).toBe('6');
		expect(t.schema.metadata.get(META_MODEL)).toBe('embeddings-v2026');
		expect(t.numRows).toBe(2);
		expect(Array.from(t.getChild('family_ids')!.get(0)!.toArray())).toEqual([7]);
	});
	it('refuses rows from more than one embedding version', () => {
		expect(() => rowsToArrowIPC([row(1, 6), row(2, 7)])).toThrow(/versions/);
	});
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm vitest run src/lib/server/similar-explorer/serialize.test.ts`
Expected: FAIL — `META_VERSION` is not exported / metadata is `undefined`.

- [ ] **Step 3: Implement**

In `serialize.ts`, add `Schema` to the apache-arrow import:

```ts
import { Table, Schema, vectorFromArray, tableToIPC, Utf8, Int32, Float32, List, Field } from 'apache-arrow';
```

Add after the `num` helper:

```ts
/**
 * Model identity rides in the schema metadata, as the coordinates artifact's does
 * (`coordinates/serialize.ts`), so a page reading both can refuse to mix embedding runs.
 */
export const META_VERSION = 'embedding_version';
export const META_MODEL = 'embedding_model';
```

Replace the final `return tableToIPC(table, 'stream');` in `rowsToArrowIPC` with:

```ts
	const versions = new Set(rows.map((r) => num(r.embedding_version)).filter((v): v is number => v != null));
	const models = new Set(rows.map((r) => r.embedding_model).filter((m) => m != null).map(String));
	if (versions.size > 1 || models.size > 1) {
		throw new Error(`similarity dataset spans ${versions.size} embedding versions / ${models.size} models`);
	}
	const metadata = new Map<string, string>([
		[META_VERSION, versions.size ? String([...versions][0]) : ''],
		[META_MODEL, models.size ? [...models][0] : '']
	]);
	const schema = new Schema(
		table.schema.fields.map((f) => new Field(f.name, f.type, f.nullable)),
		metadata
	);
	return tableToIPC(new Table(schema, table.batches), 'stream');
```

In `build.ts`, in the final `SELECT` of `querySql()`, add two columns after `pl.product_line_id`:

```sql
      pl.product_line_id,
      s.embedding_version,
      s.embedding_model
```

(`analytics.game_similarity_search` carries both — see `bgg-data-warehouse/definitions/game_similarity_search.sqlx`.)

Update the header comment of `serialize.ts`'s module doc with one line: "The embedding run is stamped in the schema metadata (`META_VERSION`, `META_MODEL`)."

- [ ] **Step 4: Run test to verify it passes**

Run: `pnpm vitest run src/lib/server/similar-explorer/serialize.test.ts`
Expected: PASS (2 tests).

- [ ] **Step 5: Commit and push**

```bash
git add src/lib/server/similar-explorer/
git commit -m "feat(similar): stamp the dev similarity dataset with its embedding version

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
git push
```

- [ ] **Step 6: Regenerate the stale dataset — ASK PHIL FIRST**

The cached `.cache/similar-explorer.arrow.gz` predates both the latest data and this stamp. Ask Phil: "OK to run `just similar-rebuild`? It deletes the local cache; the next `/dev/similar/dataset` request on your dev server rebuilds it from BigQuery (~97 MB scanned, ~40 s)." Run it only on a yes. The coordinates artifact comes from the CI-built GCS rail and needs no local action; Task 3's version check will report if it is behind.

---

### Task 2: The genealogy core — `buildGenealogy`

**Files:**
- Create: `src/lib/map/genealogy.ts`
- Test: `src/lib/map/genealogy.test.ts`

**Interfaces:**
- Consumes: `dot(emb, dim, a, b)` from `network.ts`.
- Produces (all exported from `genealogy.ts`):

```ts
interface GenealogyInput { n; dim; emb: Float32Array; ids: Int32Array; year: Int16Array; families: number[][]; related: number[][]; has: (i: number) => boolean; cache?: Map<number, Link[]> }
interface Link { i: number; sim: number }
type Dir = 'up' | 'down' | 'same';
type LinkKind = 'related' | 'family' | 'influence';
interface GenealogyNode { i; side: 'centre' | Dir; gen: number; via: number; sim: number; kind: LinkKind | null; unfolded: boolean; hidden: number }
interface Genealogy { centre: number; placeable: boolean; nodes: GenealogyNode[]; centreHidden: Record<Dir, number> }
interface GenealogyOpts { threshold: number; cap: number; unfolded: ReadonlySet<number>; expanded: ReadonlySet<string> }
expandKey(i: number, dir: Dir): string
placeable(d: GenealogyInput, i: number): boolean
linked(d: GenealogyInput, from: number, threshold: number): Link[]
linkKind(d: GenealogyInput, a: number, b: number): LinkKind
buildGenealogy(d: GenealogyInput, centre: number, o: GenealogyOpts): Genealogy
```

All indices are coordinates-artifact row indices. `nodes[0]` is always the centre.

- [ ] **Step 1: Write the failing tests**

```ts
// src/lib/map/genealogy.test.ts
import { describe, it, expect } from 'vitest';
import { buildGenealogy, expandKey, linkKind, linked, type GenealogyInput, type GenealogyOpts, type Link } from './genealogy';

/**
 * Unit vectors in 2-d at the given angles; cos(Δangle) is the similarity, so with the
 * default threshold 0.9 two games link when their angles are within ~0.45 rad.
 * Game ids are 100 + index.
 */
function input(rows: { a: number; y: number; fam?: number[]; rel?: number[]; has?: boolean }[]): GenealogyInput {
	const emb = new Float32Array(rows.length * 2);
	rows.forEach((r, i) => { emb[i * 2] = Math.cos(r.a); emb[i * 2 + 1] = Math.sin(r.a); });
	return {
		n: rows.length, dim: 2, emb,
		ids: Int32Array.from(rows, (_, i) => 100 + i),
		year: Int16Array.from(rows, (r) => r.y),
		families: rows.map((r) => r.fam ?? []),
		related: rows.map((r) => r.rel ?? []),
		has: (i) => rows[i].has !== false
	};
}
const opts = (o: Partial<GenealogyOpts> = {}): GenealogyOpts =>
	({ threshold: 0.9, cap: 8, unfolded: new Set(), expanded: new Set(), ...o });
const at = (g: ReturnType<typeof buildGenealogy>, i: number) => g.nodes.find((n) => n.i === i);

describe('buildGenealogy', () => {
	it('splits linked games by year: earlier up, later down, same year beside', () => {
		const d = input([{ a: 0, y: 2013 }, { a: 0.1, y: 2007 }, { a: 0.2, y: 2016 }, { a: 0.15, y: 2013 }, { a: 1.5, y: 2000 }]);
		const g = buildGenealogy(d, 0, opts());
		expect(g.nodes[0]).toMatchObject({ i: 0, side: 'centre', gen: 0 });
		expect(at(g, 1)).toMatchObject({ side: 'up', gen: -1, via: 0 });
		expect(at(g, 2)).toMatchObject({ side: 'down', gen: 1, via: 0 });
		expect(at(g, 3)).toMatchObject({ side: 'same', gen: 0, via: 0 });
		expect(at(g, 4)).toBeUndefined(); // not similar enough
	});

	it('chains: a parent\'s parents come from the parent, not the centre', () => {
		// sim(0,2) = cos 0.7 ≈ 0.76 < 0.9, sim(1,2) = cos 0.4 ≈ 0.92
		const d = input([{ a: 0, y: 2013 }, { a: 0.3, y: 2007 }, { a: 0.7, y: 2005 }]);
		const closed = buildGenealogy(d, 0, opts());
		expect(at(closed, 2)).toBeUndefined();
		expect(at(closed, 1)).toMatchObject({ unfolded: false, hidden: 1 });
		const open = buildGenealogy(d, 0, opts({ unfolded: new Set([1]) }));
		expect(at(open, 1)).toMatchObject({ unfolded: true, hidden: 0 });
		expect(at(open, 2)).toMatchObject({ side: 'up', gen: -2, via: 1 });
	});

	it('places each game once, under the game it was first reached through', () => {
		const d = input([{ a: 0, y: 2013 }, { a: 0.1, y: 2010 }, { a: 0.2, y: 2008 }]);
		const g = buildGenealogy(d, 0, opts({ unfolded: new Set([1]) }));
		expect(g.nodes.filter((n) => n.i === 2)).toHaveLength(1);
		expect(at(g, 2)!.via).toBe(0);
		expect(at(g, 1)!.hidden).toBe(0); // 2 is already in the tree, so not "more"
	});

	it('caps each unfold and counts the rest; expanding shows them all', () => {
		const d = input([{ a: 0, y: 2013 }, ...[1, 2, 3, 4, 5].map((k) => ({ a: k * 0.01, y: 2000 + k }))]);
		const capped = buildGenealogy(d, 0, opts({ cap: 2 }));
		expect(capped.nodes.filter((n) => n.side === 'up').map((n) => n.i)).toEqual([1, 2]); // strongest first
		expect(capped.centreHidden.up).toBe(3);
		const all = buildGenealogy(d, 0, opts({ cap: 2, expanded: new Set([expandKey(0, 'up')]) }));
		expect(all.nodes.filter((n) => n.side === 'up')).toHaveLength(5);
		expect(all.centreHidden.up).toBe(0);
	});

	it('caps the same-year row too', () => {
		const d = input([{ a: 0, y: 2013 }, ...[1, 2, 3, 4].map((k) => ({ a: k * 0.01, y: 2013 }))]);
		const g = buildGenealogy(d, 0, opts({ cap: 2 }));
		expect(g.nodes.filter((n) => n.side === 'same')).toHaveLength(2);
		expect(g.centreHidden.same).toBe(2);
	});

	it('handles BC years and leaves year-0 (unknown) games out', () => {
		const d = input([{ a: 0, y: 1990 }, { a: 0.1, y: -2200 }, { a: 0.05, y: 0 }]);
		const g = buildGenealogy(d, 0, opts());
		expect(at(g, 1)).toMatchObject({ side: 'up' });
		expect(at(g, 2)).toBeUndefined();
	});

	it('reports a centre with no year or no vector as unplaceable, with no tree', () => {
		const undated = buildGenealogy(input([{ a: 0, y: 0 }, { a: 0.1, y: 2000 }]), 0, opts());
		expect(undated.placeable).toBe(false);
		expect(undated.nodes).toHaveLength(1);
		const novec = buildGenealogy(input([{ a: 0, y: 2000, has: false }, { a: 0.1, y: 1999 }]), 0, opts());
		expect(novec.placeable).toBe(false);
	});

	it('ignores unfolded / expanded ids that are not in the tree', () => {
		const d = input([{ a: 0, y: 2013 }, { a: 0.1, y: 2007 }, { a: 2, y: 2001 }]);
		const plain = buildGenealogy(d, 0, opts());
		const stale = buildGenealogy(d, 0, opts({ unfolded: new Set([2, 99]), expanded: new Set([expandKey(2, 'up')]) }));
		expect(stale).toEqual(plain);
	});
});

describe('linkKind', () => {
	it('reimplementation beats family beats influence, and reads the link from either end', () => {
		const d = input([
			{ a: 0, y: 2000, rel: [101], fam: [9] },
			{ a: 0, y: 2001, fam: [9] },
			{ a: 0, y: 2002, fam: [9] },
			{ a: 0, y: 2003 }
		]);
		expect(linkKind(d, 0, 1)).toBe('related');
		expect(linkKind(d, 1, 0)).toBe('related'); // only game 0 lists the link
		expect(linkKind(d, 1, 2)).toBe('family');
		expect(linkKind(d, 2, 3)).toBe('influence');
	});
});

describe('linked', () => {
	it('returns every placeable game at or above the threshold, best first, memoised', () => {
		const cache = new Map<number, Link[]>();
		const d = { ...input([{ a: 0, y: 2013 }, { a: 0.2, y: 2001 }, { a: 0.1, y: 2002 }, { a: 1, y: 2003 }]), cache };
		const first = linked(d, 0, 0.9);
		expect(first.map((l) => l.i)).toEqual([2, 1]);
		expect(linked(d, 0, 0.9)).toBe(first);
	});
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `pnpm vitest run src/lib/map/genealogy.test.ts`
Expected: FAIL — cannot resolve `./genealogy`.

- [ ] **Step 3: Implement**

```ts
// src/lib/map/genealogy.ts
/**
 * One game's genealogy over the embedding: the games like it, split by publication year
 * into earlier (up), later (down) and same-year (beside), and grown a generation at a time
 * on request. Pure: dataset arrays and settings in, a tree out — so the same code can back
 * a server endpoint later.
 *
 * Rules (see docs/superpowers/specs/2026-10-12-game-genealogy-design.md):
 * - Two games link when their cosine similarity is at least `threshold`. No popularity
 *   floor: obscure games are part of the story in both directions.
 * - Chained: a parent's parents are found from that parent, never checked back against
 *   the centre, so a line can drift several generations out.
 * - Ancestors only unfold upward and descendants downward; same-year games never unfold.
 * - Each game appears once, under the game it was first reached through (breadth-first).
 * - Each unfold shows the strongest `cap`, unless expanded; `hidden` counts the rest.
 *
 * The whole tree is rebuilt from (centre, threshold, unfolded, expanded) on every change.
 * That keeps it a pure function of URL state, and a threshold move keeps every unfolded
 * game that still qualifies for free. Rebuilds are cheap because `linked` is memoised.
 */
import { dot } from './network';

export interface GenealogyInput {
	n: number;
	dim: number;
	/** Flat, L2-normalised row-major vectors, coordinates order. */
	emb: Float32Array;
	/** Index → game id. */
	ids: Int32Array;
	/** Index → year published; 0 = unknown (BC years are negative). */
	year: Int16Array;
	/** Index → its `Game:` / `Series:` family ids. */
	families: number[][];
	/** Index → game ids it reimplements or expands, or that reimplement or expand it. */
	related: number[][];
	/** The index has a vector. */
	has: (i: number) => boolean;
	/** Memo of `linked` lists for ONE threshold; the caller replaces it when the threshold moves. */
	cache?: Map<number, Link[]>;
}

export interface Link {
	i: number;
	sim: number;
}

export type Dir = 'up' | 'down' | 'same';
export type LinkKind = 'related' | 'family' | 'influence';

export interface GenealogyNode {
	i: number;
	side: 'centre' | Dir;
	/** Generations from the centre: negative up, positive down, 0 for the centre and same-year games. */
	gen: number;
	/** The game this one was reached from; -1 for the centre. */
	via: number;
	/** Similarity of the link from `via`; 1 for the centre. */
	sim: number;
	kind: LinkKind | null;
	/** Its own parents (up) or children (down) are shown. */
	unfolded: boolean;
	/** Qualifying parents/children not anywhere in the tree: all of them if folded, the overflow past the cap if not. */
	hidden: number;
}

export interface Genealogy {
	centre: number;
	/** False when the centre has no vector or no year: nothing can be placed. */
	placeable: boolean;
	/** `nodes[0]` is the centre. */
	nodes: GenealogyNode[];
	/** The centre's own overflow in each direction. */
	centreHidden: Record<Dir, number>;
}

export interface GenealogyOpts {
	threshold: number;
	/** Strongest links shown per unfold, unless expanded. */
	cap: number;
	/** Indices whose own direction is unfolded. The centre is always unfolded. */
	unfolded: ReadonlySet<number>;
	/** `expandKey(i, dir)`: show every qualifying link past the cap. */
	expanded: ReadonlySet<string>;
}

export const expandKey = (i: number, dir: Dir): string => `${i}:${dir}`;

/** Has a vector and a known year, so it can sit in a tree at all. */
export function placeable(d: GenealogyInput, i: number): boolean {
	return d.has(i) && d.year[i] !== 0;
}

/** Every placeable game at or above `threshold` to `from`, best first (ties by index). */
export function linked(d: GenealogyInput, from: number, threshold: number): Link[] {
	const hit = d.cache?.get(from);
	if (hit) return hit;
	const out: Link[] = [];
	for (let j = 0; j < d.n; j++) {
		if (j === from || !placeable(d, j)) continue;
		const s = dot(d.emb, d.dim, from, j);
		if (s >= threshold) out.push({ i: j, sim: s });
	}
	out.sort((p, q) => q.sim - p.sim || p.i - q.i);
	d.cache?.set(from, out);
	return out;
}

/** Reimplementation/expansion (either end lists it) beats a shared family beats similarity alone. */
export function linkKind(d: GenealogyInput, a: number, b: number): LinkKind {
	if (d.related[a].includes(d.ids[b]) || d.related[b].includes(d.ids[a])) return 'related';
	const fa = d.families[a];
	if (fa.length && d.families[b].some((f) => fa.includes(f))) return 'family';
	return 'influence';
}

function inDir(d: GenealogyInput, from: number, to: number, dir: Dir): boolean {
	const a = d.year[from], b = d.year[to];
	return dir === 'up' ? b < a : dir === 'down' ? b > a : b === a;
}

export function buildGenealogy(d: GenealogyInput, centre: number, o: GenealogyOpts): Genealogy {
	const root: GenealogyNode = { i: centre, side: 'centre', gen: 0, via: -1, sim: 1, kind: null, unfolded: true, hidden: 0 };
	const g: Genealogy = { centre, placeable: placeable(d, centre), nodes: [root], centreHidden: { up: 0, down: 0, same: 0 } };
	if (!g.placeable) return g;

	const seen = new Set<number>([centre]);
	const candidates = (from: number, dir: Dir) =>
		linked(d, from, o.threshold).filter((l) => !seen.has(l.i) && inDir(d, from, l.i, dir));
	const attach = (from: GenealogyNode, dir: Dir, gen: number): GenealogyNode[] => {
		const c = candidates(from.i, dir);
		const shown = o.expanded.has(expandKey(from.i, dir)) ? c : c.slice(0, o.cap);
		return shown.map((l) => {
			seen.add(l.i);
			const node: GenealogyNode = {
				i: l.i, side: dir, gen, via: from.i, sim: l.sim,
				kind: linkKind(d, from.i, l.i), unfolded: false, hidden: 0
			};
			g.nodes.push(node);
			return node;
		});
	};

	attach(root, 'same', 0);
	for (const dir of ['up', 'down'] as const) {
		const step = dir === 'up' ? -1 : 1;
		let ring = attach(root, dir, step);
		while (ring.length) {
			const next: GenealogyNode[] = [];
			for (const node of ring) {
				if (!o.unfolded.has(node.i)) continue;
				node.unfolded = true;
				next.push(...attach(node, dir, node.gen + step));
			}
			ring = next;
		}
	}

	// Overflow last, against the finished tree: a game already placed elsewhere isn't "more".
	for (const dir of ['up', 'down', 'same'] as const) g.centreHidden[dir] = candidates(centre, dir).length;
	for (const node of g.nodes) {
		if (node.side === 'up' || node.side === 'down') node.hidden = candidates(node.i, node.side).length;
	}
	return g;
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `pnpm vitest run src/lib/map/genealogy.test.ts`
Expected: PASS (all tests).

- [ ] **Step 5: Commit and push**

```bash
git add src/lib/map/genealogy.ts src/lib/map/genealogy.test.ts
git commit -m "feat(genealogy): build a game's tree — earlier up, later down, same year beside

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
git push
```

---

### Task 3: Genealogy dataset loader with a version check

**Files:**
- Modify: `src/lib/map/network-data.ts`
- Create: `src/lib/map/genealogy-data.ts`
- Test: `src/lib/map/genealogy-data.test.ts`

**Interfaces:**
- Consumes: `CoordinateSet` (`coordinates.ts`: `ids`, `index`, `version`), `GameFacts` (`facts.ts`: `year: Int16Array`, aligned to coords order), Task 1's metadata key `'embedding_version'`.
- Produces:
  - `alignVectors(t: Table, coords: CoordinateSet): { emb: Float32Array; dim: number; have: Uint8Array }` exported from `network-data.ts`.
  - Consumes `GenealogyInput` from Task 2's `genealogy.ts`.
  - `parseGenealogyDataset(buf: Uint8Array, coords: CoordinateSet, facts: GameFacts): GenealogyInput`
  - `loadGenealogyData(coords: CoordinateSet, facts: GameFacts): Promise<GenealogyInput>`


- [ ] **Step 1: Extract `alignVectors` from `network-data.ts`**

Replace the body of `network-data.ts` from the `const t = tableFromIPC(...)` line through the end of the `for` loop with a call to a new exported function, so the file becomes:

```ts
import { tableFromIPC, type Table } from 'apache-arrow';
import type { CoordinateSet } from './coordinates';
import type { GameFacts } from './facts';
import type { NetworkData } from './network';

/**
 * The dataset's 64-d vectors, L2-normalised and placed at their coordinates-artifact row,
 * so a graph index is a map index. `have[i]` marks rows that got a vector; games the
 * dataset has but the coordinates don't are skipped.
 */
export function alignVectors(t: Table, coords: CoordinateSet): { emb: Float32Array; dim: number; have: Uint8Array } {
	const ids = t.getChild('game_id')!.toArray() as Int32Array;
	// eslint-disable-next-line @typescript-eslint/no-explicit-any
	const col = t.getChild('embedding') as any;
	const n = coords.ids.length;
	const dim: number = col.get(0)?.length ?? 64;
	const emb = new Float32Array(n * dim);
	const have = new Uint8Array(n);
	for (let o = 0; o < t.numRows; o++) {
		const i = coords.index.get(ids[o]);
		if (i == null) continue;
		// A list cell is an Arrow Vector — `.get(d)` works, `[d]` doesn't.
		const v = (col.get(o)?.toArray() ?? null) as ArrayLike<number> | null;
		if (!v) continue;
		let norm = 0;
		for (let d = 0; d < dim; d++) norm += v[d] * v[d];
		norm = Math.sqrt(norm) || 1;
		for (let d = 0; d < dim; d++) emb[i * dim + d] = v[d] / norm;
		have[i] = 1;
	}
	return { emb, dim, have };
}

export async function loadNetworkData(
	coords: CoordinateSet,
	facts: GameFacts,
	minRatings: () => number
): Promise<NetworkData> {
	const res = await fetch('/dev/similar/dataset');
	if (!res.ok) throw new Error(`embedding dataset fetch failed (${res.status})`);
	const t = tableFromIPC(new Uint8Array(await res.arrayBuffer()));
	const { emb, dim, have } = alignVectors(t, coords);
	return {
		n: coords.ids.length, dim, emb,
		eligible: (i) => have[i] === 1 && facts.upcoming[i] === 0 && facts.usersRated[i] >= minRatings()
	};
}
```

Keep the file's existing top-of-file doc comment. Run `pnpm vitest run src/lib/map` — expected: all existing map tests still PASS (pure refactor).

- [ ] **Step 2: Write the failing test**

```ts
// src/lib/map/genealogy-data.test.ts
import { describe, it, expect } from 'vitest';
import { rowsToArrowIPC } from '$lib/server/similar-explorer/serialize';
import { parseGenealogyDataset } from './genealogy-data';
import type { CoordinateSet } from './coordinates';
import type { GameFacts } from './facts';

function coords(ids: number[], version = 6): CoordinateSet {
	return {
		ids: Int32Array.from(ids), pcs: [], umap: [new Float32Array(), new Float32Array()], k: 2,
		model: 'embeddings-v2026', version, index: new Map(ids.map((id, i) => [id, i]))
	};
}
const facts = (years: number[]) => ({ year: Int16Array.from(years) }) as unknown as GameFacts;
const row = (game_id: number, emb: number[], extra: Record<string, unknown> = {}) => ({
	game_id, complexity: 2, min_playtime: 30, max_playtime: 60, embedding: emb,
	family_ids: [], family_labels: [], related_ids: [], product_line_id: null,
	embedding_version: 6, embedding_model: 'embeddings-v2026', ...extra
});

describe('parseGenealogyDataset', () => {
	it('aligns vectors, families and related ids to coordinates order', () => {
		const buf = rowsToArrowIPC([
			row(20, [0, 2], { family_ids: [5], related_ids: [10] }),
			row(10, [3, 0])
		]);
		const d = parseGenealogyDataset(buf, coords([10, 20, 30]), facts([2007, 2013, 2016]));
		expect(d.n).toBe(3);
		expect(Array.from(d.emb.slice(0, 2))).toEqual([1, 0]); // id 10, normalised
		expect(Array.from(d.emb.slice(2, 4))).toEqual([0, 1]); // id 20
		expect(d.families[1]).toEqual([5]);
		expect(d.related[1]).toEqual([10]);
		expect(d.has(2)).toBe(false); // id 30 has no vector
		expect(Array.from(d.year)).toEqual([2007, 2013, 2016]);
	});
	it('refuses a dataset from a different embedding version than the coordinates', () => {
		const buf = rowsToArrowIPC([row(10, [1, 0])]);
		expect(() => parseGenealogyDataset(buf, coords([10], 7), facts([2007]))).toThrow(/v6.*v7/);
	});
	it('refuses a dataset cached before version stamping, naming the fix', () => {
		const buf = rowsToArrowIPC([row(10, [1, 0], { embedding_version: null, embedding_model: null })]);
		expect(() => parseGenealogyDataset(buf, coords([10]), facts([2007]))).toThrow(/similar-rebuild/);
	});
});
```

- [ ] **Step 3: Run test to verify it fails**

Run: `pnpm vitest run src/lib/map/genealogy-data.test.ts`
Expected: FAIL — cannot resolve `./genealogy-data`.

- [ ] **Step 4: Implement**

```ts
// src/lib/map/genealogy-data.ts
/**
 * The vectors, years and family / reimplementation ids a genealogy is built from: the dev
 * similarity dataset (`/dev/similar/dataset`) aligned to the coordinates artifact's order,
 * so a tree index is a map index and `PointCanvas` can draw it. Dev-only by construction —
 * that dataset is ~9 MB and never ships.
 *
 * The two artifacts are built separately, so they can come from different embedding runs.
 * `alignVectors` would then silently drop every game the older one lacks; instead this
 * refuses to load and says which one to rebuild.
 */
import { tableFromIPC } from 'apache-arrow';
import type { CoordinateSet } from './coordinates';
import type { GameFacts } from './facts';
import type { GenealogyInput } from './genealogy';
import { alignVectors } from './network-data';

/** Same key as `server/similar-explorer/serialize.ts` `META_VERSION` (server code can't be imported here). */
const META_VERSION = 'embedding_version';

export function parseGenealogyDataset(buf: Uint8Array, coords: CoordinateSet, facts: GameFacts): GenealogyInput {
	const t = tableFromIPC(buf);
	const v = t.schema.metadata.get(META_VERSION);
	if (!v) {
		throw new Error('The similarity dataset predates version stamping — run `just similar-rebuild` and reload.');
	}
	if (Number(v) !== coords.version) {
		throw new Error(
			`The similarity dataset is embedding v${v} but the coordinates are v${coords.version} — rebuild the older one (\`just similar-rebuild\` for the dataset).`
		);
	}
	const { emb, dim, have } = alignVectors(t, coords);
	const n = coords.ids.length;
	const families: number[][] = Array.from({ length: n }, () => []);
	const related: number[][] = Array.from({ length: n }, () => []);
	const ids = t.getChild('game_id')!.toArray() as Int32Array;
	// eslint-disable-next-line @typescript-eslint/no-explicit-any
	const fam = t.getChild('family_ids') as any, rel = t.getChild('related_ids') as any;
	for (let o = 0; o < t.numRows; o++) {
		const i = coords.index.get(ids[o]);
		if (i == null) continue;
		families[i] = Array.from((fam.get(o)?.toArray() ?? []) as ArrayLike<number>);
		related[i] = Array.from((rel.get(o)?.toArray() ?? []) as ArrayLike<number>);
	}
	return { n, dim, emb, ids: coords.ids, year: facts.year, families, related, has: (i) => have[i] === 1 };
}

export async function loadGenealogyData(coords: CoordinateSet, facts: GameFacts): Promise<GenealogyInput> {
	const res = await fetch('/dev/similar/dataset');
	if (!res.ok) throw new Error(`similarity dataset fetch failed (${res.status})`);
	return parseGenealogyDataset(new Uint8Array(await res.arrayBuffer()), coords, facts);
}
```

- [ ] **Step 5: Run tests**

Run: `pnpm vitest run src/lib/map/genealogy-data.test.ts src/lib/map/network.test.ts`
Expected: PASS.

- [ ] **Step 6: Commit and push**

```bash
git add src/lib/map/network-data.ts src/lib/map/genealogy-data.ts src/lib/map/genealogy-data.test.ts
git commit -m "feat(genealogy): load the dataset aligned to the map, refusing mixed embedding runs

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
git push
```

---

### Task 4: Layout and edge geometry

**Files:**
- Create: `src/lib/map/genealogy-layout.ts`
- Test: `src/lib/map/genealogy-layout.test.ts`

**Interfaces:**
- Consumes: `Genealogy`, `GenealogyNode` from Task 2.
- Produces:

```ts
type YMode = 'year' | 'gen';
interface Tick { label: string; y: number }            // y in NDC
interface GenealogyLayout { genealogy: Genealogy; x: Float32Array; y: Float32Array; ticks: Tick[] } // x/y parallel to genealogy.nodes, NDC, fitted to [-0.9, 0.9]
layoutGenealogy(g: Genealogy, year: Int16Array, mode: YMode): GenealogyLayout
ndcToScreen(a: { ndc: [number, number]; px: [number, number] }, b: same): ((x: number, y: number) => [number, number]) | null
dashed(points: [number, number][], on: number, off: number): [number, number][][]
offset(points: [number, number][], d: number): [number, number][]
```

- [ ] **Step 1: Write the failing tests**

```ts
// src/lib/map/genealogy-layout.test.ts
import { describe, it, expect } from 'vitest';
import { layoutGenealogy, ndcToScreen, dashed, offset } from './genealogy-layout';
import type { Genealogy, GenealogyNode } from './genealogy';

const node = (i: number, side: GenealogyNode['side'], gen: number, via: number): GenealogyNode =>
	({ i, side, gen, via, sim: 0.9, kind: 'influence', unfolded: false, hidden: 0 });
const tree = (nodes: GenealogyNode[]): Genealogy =>
	({ centre: 0, placeable: true, nodes, centreHidden: { up: 0, down: 0, same: 0 } });

// 0 centre 2013; 1,2 parents (2007, 2010); 3 grandparent via 1 (2005);
// 4,5 children (2016, 2019); 6 same year (2013); 7 same year (2013)
const year = Int16Array.from([2013, 2007, 2010, 2005, 2016, 2019, 2013, 2013]);
const g = tree([
	node(0, 'centre', 0, -1), node(1, 'up', -1, 0), node(2, 'up', -1, 0), node(3, 'up', -2, 1),
	node(4, 'down', 1, 0), node(5, 'down', 1, 0), node(6, 'same', 0, 0), node(7, 'same', 0, 0)
]);
const j = (i: number) => g.nodes.findIndex((n) => n.i === i);

describe('layoutGenealogy', () => {
	it('generation mode: ancestors above, descendants below, one row per generation', () => {
		const l = layoutGenealogy(g, year, 'gen');
		expect(l.y[j(1)]).toBeGreaterThan(l.y[j(0)]);
		expect(l.y[j(1)]).toBeCloseTo(l.y[j(2)]);
		expect(l.y[j(3)]).toBeGreaterThan(l.y[j(1)]);
		expect(l.y[j(4)]).toBeLessThan(l.y[j(0)]);
		expect(l.y[j(4)]).toBeCloseTo(l.y[j(5)]);
		expect(l.ticks.map((t) => t.label)).toEqual(['−2', '−1', '0', '+1']);
	});
	it('year mode: y is proportional to the year gap', () => {
		const l = layoutGenealogy(g, year, 'year');
		const per = (l.y[j(1)] - l.y[j(0)]) / 6; // 2007 is 6 years before 2013
		expect(l.y[j(2)] - l.y[j(0)]).toBeCloseTo(per * 3);
		expect(l.y[j(5)] - l.y[j(0)]).toBeCloseTo(per * -6);
	});
	it('puts a parent above the middle of its children and the centre at x of its first row', () => {
		const l = layoutGenealogy(g, year, 'gen');
		// down half: 4 and 5 are the centre's children, centred under it
		expect((l.x[j(4)] + l.x[j(5)]) / 2).toBeCloseTo(l.x[j(0)]);
		expect(l.x[j(4)]).not.toBeCloseTo(l.x[j(5)]);
	});
	it('puts same-year games on the centre\'s row, either side, apart', () => {
		const l = layoutGenealogy(g, year, 'year');
		expect(l.y[j(6)]).toBeCloseTo(l.y[j(0)]);
		expect(Math.sign(l.x[j(6)] - l.x[j(0)])).toBe(-Math.sign(l.x[j(7)] - l.x[j(0)]));
	});
	it('fits within [-0.9, 0.9] and handles a lone centre without NaN', () => {
		const l = layoutGenealogy(g, year, 'year');
		for (const v of [...l.x, ...l.y]) expect(Math.abs(v)).toBeLessThanOrEqual(0.9 + 1e-6);
		const lone = layoutGenealogy(tree([node(0, 'centre', 0, -1)]), year, 'year');
		expect([lone.x[0], lone.y[0]]).toEqual([0, 0]);
	});
});

describe('geometry', () => {
	it('ndcToScreen recovers a translate + uniform scale (screen y runs down)', () => {
		const f = ndcToScreen({ ndc: [0, 0], px: [100, 100] }, { ndc: [0.5, 0.5], px: [150, 50] })!;
		expect(f(-0.5, -0.5)).toEqual([50, 150]);
		expect(ndcToScreen({ ndc: [0, 0], px: [1, 1] }, { ndc: [0, 0], px: [1, 1] })).toBeNull();
	});
	it('dashed cuts a line into on/off runs', () => {
		const ds = dashed([[0, 0], [1, 0]], 0.2, 0.1);
		expect(ds).toHaveLength(4);
		const drawn = ds.reduce((s, d) => s + (d[d.length - 1][0] - d[0][0]), 0);
		expect(drawn).toBeCloseTo(0.7);
	});
	it('offset moves a line sideways along its left normal', () => {
		expect(offset([[0, 0], [1, 0]], 0.1)).toEqual([[0, 0.1], [1, 0.1]]);
	});
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `pnpm vitest run src/lib/map/genealogy-layout.test.ts`
Expected: FAIL — cannot resolve `./genealogy-layout`.

- [ ] **Step 3: Implement**

```ts
// src/lib/map/genealogy-layout.ts
/**
 * Where a genealogy's games sit: top-down, ancestors above the chosen game, descendants
 * below, same-year games on its row. y is the publication year (a long edge is a long gap,
 * a flurry is a dense band) or the generation (evenly spaced rows). x is a tidy-tree spread
 * per half: leaves take consecutive slots and a parent sits over the middle of its
 * children, so links cross as little as they can.
 *
 * Output is NDC fitted to [-0.9, 0.9] like `layoutEgoNetwork`, so `PointCanvas` can fly
 * points into it. Also here: the small geometry the layer needs for edges and the axis.
 */
import type { Genealogy } from './genealogy';

export type YMode = 'year' | 'gen';

export interface Tick {
	label: string;
	/** NDC. */
	y: number;
}

export interface GenealogyLayout {
	genealogy: Genealogy;
	/** NDC, parallel to `genealogy.nodes`. */
	x: Float32Array;
	y: Float32Array;
	ticks: Tick[];
}

/** Layout units: one leaf slot across, one generation down, one year down. Only ratios matter. */
const SLOT = 1;
const ROW = 1.6;
const YEAR = 0.35;
const FIT = 1.8;

const mid = (xs: number[]) => (xs[0] + xs[xs.length - 1]) / 2;
const genLabel = (g: number) => (g === 0 ? '0' : g > 0 ? `+${g}` : `−${-g}`);

export function layoutGenealogy(g: Genealogy, year: Int16Array, mode: YMode): GenealogyLayout {
	const nodes = g.nodes;
	const m = nodes.length;
	const lx = new Float64Array(m), ly = new Float64Array(m);

	/** `${parent index}:${side}` → positions in `nodes` of its children on that side. */
	const kids = new Map<string, number[]>();
	nodes.forEach((nd, j) => {
		if (nd.side !== 'up' && nd.side !== 'down') return;
		const key = `${nd.via}:${nd.side}`;
		const list = kids.get(key);
		if (list) list.push(j);
		else kids.set(key, [j]);
	});

	for (const side of ['up', 'down'] as const) {
		let next = 0;
		const members: number[] = [];
		const place = (j: number): number => {
			members.push(j);
			const cs = kids.get(`${nodes[j].i}:${side}`) ?? [];
			lx[j] = cs.length ? mid(cs.map(place)) : next++ * SLOT;
			return lx[j];
		};
		const xs = (kids.get(`${g.centre}:${side}`) ?? []).map(place);
		const shift = xs.length ? mid(xs) : 0;
		for (const j of members) lx[j] -= shift;
	}

	let k = 0;
	nodes.forEach((nd, j) => {
		if (nd.side !== 'same') return;
		k++;
		lx[j] = (k % 2 ? 1 : -1) * Math.ceil(k / 2) * SLOT;
	});

	const cy = year[g.centre];
	nodes.forEach((nd, j) => {
		ly[j] = mode === 'gen' ? -nd.gen * ROW : (cy - year[nd.i]) * YEAR;
	});

	let x0 = Infinity, x1 = -Infinity, y0 = Infinity, y1 = -Infinity;
	for (let j = 0; j < m; j++) {
		x0 = Math.min(x0, lx[j]); x1 = Math.max(x1, lx[j]);
		y0 = Math.min(y0, ly[j]); y1 = Math.max(y1, ly[j]);
	}
	const span = Math.max(x1 - x0, y1 - y0);
	const s = span > 0 ? FIT / span : 1;
	const ox = (x0 + x1) / 2, oy = (y0 + y1) / 2;
	const x = new Float32Array(m), y = new Float32Array(m);
	for (let j = 0; j < m; j++) { x[j] = (lx[j] - ox) * s; y[j] = (ly[j] - oy) * s; }
	const toY = (v: number) => (v - oy) * s;

	const ticks: Tick[] = [];
	if (mode === 'gen') {
		const gens = nodes.map((nd) => nd.gen);
		for (let gn = Math.min(...gens); gn <= Math.max(...gens); gn++) ticks.push({ label: genLabel(gn), y: toY(-gn * ROW) });
	} else {
		const ys = nodes.map((nd) => year[nd.i]);
		const lo = Math.min(...ys), hi = Math.max(...ys);
		const step = hi - lo <= 12 ? 1 : hi - lo <= 30 ? 5 : 10;
		for (let v = Math.ceil(lo / step) * step; v <= hi; v += step) ticks.push({ label: String(v), y: toY((cy - v) * YEAR) });
	}
	return { genealogy: g, x, y, ticks };
}

/**
 * The canvas camera is a translate plus a uniform scale (the data square is never
 * stretched on this page), so two points with distinct NDC fix the NDC → screen map. The
 * overlay only gets screen positions of points; this lets it place axis ticks too.
 */
export function ndcToScreen(
	a: { ndc: [number, number]; px: [number, number] },
	b: { ndc: [number, number]; px: [number, number] }
): ((x: number, y: number) => [number, number]) | null {
	const dx = b.ndc[0] - a.ndc[0], dy = b.ndc[1] - a.ndc[1];
	const d2 = dx * dx + dy * dy;
	if (d2 < 1e-12) return null;
	const k = ((b.px[0] - a.px[0]) * dx - (b.px[1] - a.px[1]) * dy) / d2;
	return (x, y) => [a.px[0] + k * (x - a.ndc[0]), a.px[1] - k * (y - a.ndc[1])];
}

/** Cut a polyline into dashes: `on` drawn, `off` skipped, in the polyline's own units. */
export function dashed(points: [number, number][], on: number, off: number): [number, number][][] {
	const out: [number, number][][] = [];
	let drawing = true, left = on;
	let cur: [number, number][] = [points[0]];
	for (let k = 1; k < points.length; k++) {
		let [ax, ay] = points[k - 1];
		const [bx, by] = points[k];
		let seg = Math.hypot(bx - ax, by - ay);
		while (seg > left) {
			const t = left / seg;
			const px = ax + (bx - ax) * t, py = ay + (by - ay) * t;
			if (drawing) { cur.push([px, py]); out.push(cur); } else cur = [[px, py]];
			drawing = !drawing;
			seg -= left;
			left = drawing ? on : off;
			ax = px; ay = py;
		}
		left -= seg;
		if (drawing) cur.push([bx, by]);
	}
	if (drawing && cur.length > 1) out.push(cur);
	return out;
}

/** A polyline moved `d` along its left normal — the second stroke of a double line. */
export function offset(points: [number, number][], d: number): [number, number][] {
	return points.map((p, k) => {
		const a = points[Math.max(0, k - 1)], b = points[Math.min(points.length - 1, k + 1)];
		const dx = b[0] - a[0], dy = b[1] - a[1], len = Math.hypot(dx, dy) || 1;
		return [p[0] - (dy / len) * d, p[1] + (dx / len) * d];
	});
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `pnpm vitest run src/lib/map/genealogy-layout.test.ts`
Expected: PASS. If the `dashed` count is off by a float hair at the final boundary, assert `toBeGreaterThanOrEqual(4)` only after confirming by hand that the extra dash has ~0 length — do not loosen the drawn-length check.

- [ ] **Step 5: Commit and push**

```bash
git add src/lib/map/genealogy-layout.ts src/lib/map/genealogy-layout.test.ts
git commit -m "feat(genealogy): top-down layout by year or generation, with edge geometry

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
git push
```

---

### Task 5: URL state

**Files:**
- Create: `src/lib/map/genealogy-url.ts`
- Test: `src/lib/map/genealogy-url.test.ts`

**Interfaces:**
- Consumes: `YMode` from Task 4.
- Produces:

```ts
interface GenealogyState { game: number | null; t: number; y: YMode; unfolded: number[]; expanded: string[]; trail: number[] }
// unfolded/trail are GAME IDS; expanded are `${gameId}:${dir}` — ids, not indices, so URLs survive a new artifact.
const DEFAULT_THRESHOLD = 0.8;
const DEFAULT_CAP = 8;
fromParams(p: URLSearchParams): GenealogyState
toParams(s: GenealogyState): URLSearchParams
```

- [ ] **Step 1: Write the failing tests**

```ts
// src/lib/map/genealogy-url.test.ts
import { describe, it, expect } from 'vitest';
import { fromParams, toParams, DEFAULT_THRESHOLD, type GenealogyState } from './genealogy-url';

describe('genealogy URL state', () => {
	it('defaults from an empty URL', () => {
		expect(fromParams(new URLSearchParams())).toEqual({
			game: null, t: DEFAULT_THRESHOLD, y: 'year', unfolded: [], expanded: [], trail: []
		});
	});
	it('round-trips a full state', () => {
		const s: GenealogyState = { game: 102794, t: 0.72, y: 'gen', unfolded: [31260, 3076], expanded: ['31260:up'], trail: [177736] };
		expect(fromParams(toParams(s))).toEqual(s);
	});
	it('writes nothing for defaults', () => {
		expect(toParams(fromParams(new URLSearchParams())).toString()).toBe('');
	});
	it('drops junk instead of throwing', () => {
		const s = fromParams(new URLSearchParams('game=abc&t=7&y=sideways&u=1,x,,-3&a=5:up,6:sideways,bad&trail=0'));
		expect(s).toEqual({ game: null, t: DEFAULT_THRESHOLD, y: 'year', unfolded: [1], expanded: ['5:up'], trail: [] });
	});
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `pnpm vitest run src/lib/map/genealogy-url.test.ts`
Expected: FAIL — cannot resolve `./genealogy-url`.

- [ ] **Step 3: Implement**

```ts
// src/lib/map/genealogy-url.ts
/**
 * `/dev/genealogy`'s state, all of it in the URL, so a tree can be linked and Back
 * restores the one before (the page pushes a history entry per re-centre). Game ids, not
 * dataset indices, so a URL survives a rebuilt artifact. Junk is dropped, never thrown.
 */
import type { YMode } from './genealogy-layout';

export interface GenealogyState {
	game: number | null;
	t: number;
	y: YMode;
	/** Game ids whose own direction is unfolded. */
	unfolded: number[];
	/** `${gameId}:${dir}` — shown past the cap. */
	expanded: string[];
	/** Previous centres, oldest first. */
	trail: number[];
}

/** Starting similarity floor. A tuning value: revisit after the first look at real trees. */
export const DEFAULT_THRESHOLD = 0.8;
/** Strongest links shown per unfold before "+N more". */
export const DEFAULT_CAP = 8;

const KEY = /^\d+:(up|down|same)$/;
const ids = (v: string | null) =>
	(v ?? '').split(',').map(Number).filter((x) => Number.isInteger(x) && x > 0);

export function fromParams(p: URLSearchParams): GenealogyState {
	const game = Number(p.get('game'));
	const t = Number(p.get('t'));
	return {
		game: Number.isInteger(game) && game > 0 ? game : null,
		t: p.has('t') && Number.isFinite(t) && t > 0 && t < 1 ? t : DEFAULT_THRESHOLD,
		y: p.get('y') === 'gen' ? 'gen' : 'year',
		unfolded: ids(p.get('u')),
		expanded: (p.get('a') ?? '').split(',').filter((k) => KEY.test(k)),
		trail: ids(p.get('trail'))
	};
}

export function toParams(s: GenealogyState): URLSearchParams {
	const p = new URLSearchParams();
	if (s.game != null) p.set('game', String(s.game));
	if (s.t !== DEFAULT_THRESHOLD) p.set('t', String(s.t));
	if (s.y !== 'year') p.set('y', s.y);
	if (s.unfolded.length) p.set('u', s.unfolded.join(','));
	if (s.expanded.length) p.set('a', s.expanded.join(','));
	if (s.trail.length) p.set('trail', s.trail.join(','));
	return p;
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `pnpm vitest run src/lib/map/genealogy-url.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit and push**

```bash
git add src/lib/map/genealogy-url.ts src/lib/map/genealogy-url.test.ts
git commit -m "feat(genealogy): URL state — centre, threshold, axis, unfolds, trail

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
git push
```

---

### Task 6: `GenealogyLayer` on the regl canvas

**Files:**
- Create: `src/lib/map/GenealogyLayer.svelte`

**Interfaces:**
- Consumes: `useSurface`, `Driver`, `Line`, `OverlayApi` (`surface.ts`); `ring`, `glow`, `labels` (`ink.ts`); `toRgb` (`palette.ts`); `LabelInput` (`labels.ts`); `GenealogyLayout`, `ndcToScreen`, `dashed`, `offset` (Task 4); `Dir` (Task 2); `CoordinateSet`, `GameFacts`.
- Produces: component props
  `{ coords: CoordinateSet; facts: GameFacts; layout: GenealogyLayout; selected?: number /* index, -1 none */; onselect?: (i: number) => void; onunfold?: (i: number) => void; onmore?: (i: number, dir: Dir) => void }`.
  Must be mounted inside `<PointCanvas>` (throws otherwise, like `NetworkLayer`).

Reference while writing: `src/lib/map/NetworkLayer.svelte` (same Driver pattern, the `tip` state written from inside `overlay`, the multi-pass feathered lines).

- [ ] **Step 1: Write the component**

```svelte
<script lang="ts">
  /**
   * One game's genealogy as a layer on a `PointCanvas` — a sibling of `NetworkLayer` with
   * its own encodings (see the genealogy spec):
   * - colour by side: ancestors, descendants, same-year, the centre in the accent;
   *   upcoming games hollow (background fill, dashed ring);
   * - size by ratings (log), so an obscure game reads as obscure without being filtered;
   * - edges thick with similarity; solid = similarity only, dashed = same family, double =
   *   reimplementation / expansion; the selected game's edges in the accent;
   * - ⊕ (unfold, with how many are waiting) and "+N more" as HTML buttons placed from the
   *   overlay's screen positions; axis ticks (years or generations) painted on the overlay.
   *
   * All copy PLACEHOLDER.
   */
  import type { CoordinateSet } from './coordinates';
  import type { GameFacts } from './facts';
  import type { Dir } from './genealogy';
  import { ndcToScreen, dashed, offset, type GenealogyLayout } from './genealogy-layout';
  import { useSurface, type Driver, type Line, type OverlayApi } from './surface';
  import { toRgb } from './palette';
  import { ring, glow, labels } from './ink';
  import type { LabelInput } from './labels';

  let {
    coords,
    facts,
    layout,
    selected = -1,
    onselect,
    onunfold,
    onmore
  }: {
    coords: CoordinateSet;
    facts: GameFacts;
    layout: GenealogyLayout;
    /** The selected game's index, -1 for none. */
    selected?: number;
    onselect?: (i: number) => void;
    onunfold?: (i: number) => void;
    onmore?: (i: number, dir: Dir) => void;
  } = $props();

  const surface = useSurface();
  if (!surface) throw new Error('GenealogyLayer must be mounted inside a PointCanvas');

  const n = $derived(coords.ids.length);
  const g = $derived(layout.genealogy);

  const pos = $derived.by(() => {
    const x = new Float32Array(n), y = new Float32Array(n);
    g.nodes.forEach((nd, j) => { x[nd.i] = layout.x[j]; y[nd.i] = layout.y[j]; });
    return { x, y };
  });

  /** Colour buckets, indexing `palette`. */
  const BUCKET = { up: 0, down: 1, same: 2, centre: 3 } as const;
  const UPCOMING = 4;
  const palette = $derived.by(() => {
    const t = surface.theme;
    return t ? [t.chart[0], t.chart[1], t.muted, t.accent, t.background] : [];
  });
  const colour = $derived.by(() => {
    const c = new Uint8Array(n);
    for (const nd of g.nodes) c[nd.i] = nd.side !== 'centre' && facts.upcoming[nd.i] ? UPCOMING : BUCKET[nd.side];
    return c;
  });

  /** Diameter from ratings on a log scale: 30 ratings → 5px, 100k → 18px. */
  const LOG_LO = Math.log10(30), LOG_HI = 5;
  function diameter(i: number): number {
    const t = (Math.log10(Math.max(1, facts.usersRated[i])) - LOG_LO) / (LOG_HI - LOG_LO);
    return Math.round(5 + Math.min(1, Math.max(0, t)) * 13);
  }
  const size = $derived.by(() => {
    const s = new Uint8Array(n);
    for (const nd of g.nodes) s[nd.i] = diameter(nd.i);
    return s;
  });
  const visible = $derived(g.nodes.map((nd) => nd.i));

  /**
   * An edge from `a` (nearer the centre) to `b`. Up/down edges leave and arrive vertically
   * (a cubic with vertical tangents), so a tree reads as a tree. Same-year edges arc below
   * the row instead, or every one would run straight through the games between.
   */
  const SEGMENTS = 16;
  function edgePath(a: number, b: number, same: boolean): [number, number][] {
    const x1 = pos.x[a], y1 = pos.y[a], x2 = pos.x[b], y2 = pos.y[b];
    const h = same ? 0.25 * Math.abs(x2 - x1) : 0;
    const c1: [number, number] = same ? [x1, y1 - h] : [x1, (y1 + y2) / 2];
    const c2: [number, number] = same ? [x2, y2 - h] : [x2, (y1 + y2) / 2];
    const pts: [number, number][] = [];
    for (let k = 0; k <= SEGMENTS; k++) {
      const t = k / SEGMENTS, u = 1 - t;
      const w0 = u * u * u, w1 = 3 * u * u * t, w2 = 3 * u * t * t, w3 = t * t * t;
      pts.push([w0 * x1 + w1 * c1[0] + w2 * c2[0] + w3 * x2, w0 * y1 + w1 * c1[1] + w2 * c2[1] + w3 * y2]);
    }
    return pts;
  }

  /** Dash and double-line spacing, NDC. */
  const DASH_ON = 0.018, DASH_OFF = 0.012, DOUBLE_GAP = 0.004;
  const lines = $derived.by<Line[]>(() => {
    const t = surface.theme;
    if (!t) return [];
    const ink = toRgb(t.foreground).map((c) => c / 255) as [number, number, number];
    const accent = toRgb(t.accent).map((c) => c / 255) as [number, number, number];
    // Feathered like NetworkLayer's: regl's line shader has no anti-aliasing of its own.
    const PASSES: [number, number][] = [[2.2, 0.08], [1.6, 0.2], [1, 1]];
    const layers: Line[][] = PASSES.map(() => []);
    const edges = g.nodes.slice(1);
    let lo = Infinity, hi = -Infinity;
    for (const e of edges) { lo = Math.min(lo, e.sim); hi = Math.max(hi, e.sim); }
    for (const e of edges) {
      const lit = e.i === selected || e.via === selected;
      const r = hi > lo ? (e.sim - lo) / (hi - lo) : 1;
      const alpha = lit ? 1 : 0.35 + 0.5 * r;
      const width = (1.2 + r * 1.6) * (lit ? 1.3 : 1);
      const rgb = lit ? accent : ink;
      const path = edgePath(e.via, e.i, e.side === 'same');
      const strokes =
        e.kind === 'family' ? dashed(path, DASH_ON, DASH_OFF)
        : e.kind === 'related' ? [offset(path, DOUBLE_GAP), offset(path, -DOUBLE_GAP)]
        : [path];
      const w = e.kind === 'related' ? width * 0.7 : width;
      for (const points of strokes) {
        PASSES.forEach(([wm, am], k) => layers[k].push({ points, color: [...rgb, alpha * am], width: w * wm }));
      }
    }
    return layers.flat();
  });

  type Mark = { key: string; x: number; y: number; label: string; act: () => void };
  /** Written from inside `overlay` (like NetworkLayer's `tip`); raw so the closures aren't proxied. */
  let marks = $state.raw<Mark[]>([]);

  const yearOf = (i: number) => facts.year[i] || '—';

  function paint(ctx: CanvasRenderingContext2D, api: OverlayApi) {
    const { theme, screen } = api;
    // Nothing mid-flight or mid-drag: the 2-D overlay can't keep step with the GL canvas.
    if (!api.drawn || api.dragging) { marks = []; return; }
    const at = new Map<number, [number, number]>();
    for (const nd of g.nodes) { const p = screen(nd.i); if (p) at.set(nd.i, p); }

    // Axis: ticks need NDC → screen, which two placed nodes at distinct NDC pin down.
    const placed = g.nodes.map((nd, j) => ({ j, p: at.get(nd.i) })).filter((v) => v.p);
    const a = placed[0];
    const b = placed.find((v) => layout.x[v.j] !== layout.x[a?.j ?? 0] || layout.y[v.j] !== layout.y[a?.j ?? 0]);
    const map = a && b
      ? ndcToScreen({ ndc: [layout.x[a.j], layout.y[a.j]], px: a.p! }, { ndc: [layout.x[b.j], layout.y[b.j]], px: b.p! })
      : null;
    if (map) {
      ctx.save();
      ctx.font = '11px system-ui, sans-serif';
      ctx.textBaseline = 'middle';
      for (const tk of layout.ticks) {
        const [, sy] = map(0, tk.y);
        if (sy < 0 || sy > api.height) continue;
        ctx.globalAlpha = 0.12;
        ctx.strokeStyle = theme.foreground;
        ctx.beginPath(); ctx.moveTo(40, sy); ctx.lineTo(api.width, sy); ctx.stroke();
        ctx.globalAlpha = 0.6;
        ctx.fillStyle = theme.foreground;
        ctx.fillText(tk.label, 6, sy);
      }
      ctx.restore();
    }

    const rad = (i: number) => (diameter(i) / 2) * api.pointScale;
    const centre = g.nodes[0];
    const cp = at.get(centre.i);
    if (cp) glow(ctx, cp[0], cp[1], rad(centre.i) * 3, theme.accent, 0.35);

    const want: LabelInput[] = [];
    for (const nd of g.nodes) {
      const p = at.get(nd.i);
      if (!p) continue;
      const r = rad(nd.i);
      if (nd.side === 'centre') ring(ctx, p[0], p[1], r + 2, theme.foreground, theme.background, 2.5);
      if (nd.side !== 'centre' && facts.upcoming[nd.i]) {
        ctx.save(); ctx.setLineDash([2, 2]);
        ring(ctx, p[0], p[1], r, theme.foreground, theme.background, 1.2);
        ctx.restore();
      }
      if (nd.i === selected) ring(ctx, p[0], p[1], r + 3, theme.accent, theme.background, 2);
      want.push({ x: p[0], y: p[1], text: `${facts.name(coords.ids[nd.i])} (${yearOf(nd.i)})`, gap: r + 4 });
    }
    // Priority: the centre, the selected game, then tree order (strongest first per unfold).
    const sel = selected >= 0 ? at.get(selected) : undefined;
    if (sel) want.sort((l, r) => Number(r.x === sel[0] && r.y === sel[1]) - Number(l.x === sel[0] && l.y === sel[1]));
    labels(ctx, want, api.width, api.height, theme.foreground, theme.background, { chip: false, drop: true });

    const next: Mark[] = [];
    const push = (i: number, dir: Dir, count: number, folded: boolean) => {
      const p = at.get(i);
      if (!p || count <= 0) return;
      const r = rad(i) + 12;
      const [x, y] = dir === 'up' ? [p[0], p[1] - r] : dir === 'down' ? [p[0], p[1] + r] : [p[0] + r + 24, p[1]];
      next.push(folded
        ? { key: `u${i}`, x, y, label: `⊕ ${count}`, act: () => onunfold?.(i) }
        : { key: `m${i}:${dir}`, x, y, label: `+${count} more`, act: () => onmore?.(i, dir) });
    };
    for (const dir of ['up', 'down', 'same'] as const) push(centre.i, dir, g.centreHidden[dir], false);
    for (const nd of g.nodes) if (nd.side === 'up' || nd.side === 'down') push(nd.i, nd.side, nd.hidden, !nd.unfolded);
    marks = next;
  }

  const driver: Driver = {
    get x() { return pos.x; },
    get y() { return pos.y; },
    get colour() { return colour; },
    get palette() { return palette; },
    get size() { return size; },
    get visible() { return visible; },
    // Refit after every change: an unfold can grow the tree past the current view.
    get focus() { return visible; },
    get lines() { return lines; },
    opacity: 0.95,
    onselect: (points) => { if (points.length === 1) onselect?.(points[0]); },
    overlay: paint
  };
  $effect(() => {
    surface.drive(driver);
    return () => surface.release(driver);
  });
  $effect(() => { void lines; void selected; surface.repaint(); });
</script>

{#each marks as m (m.key)}
  <button type="button" class="mark" style:left="{m.x}px" style:top="{m.y}px" onclick={m.act}>{m.label}</button>
{/each}

<!-- PLACEHOLDER COPY (Phil): legend labels. -->
<div class="legend">
  <div class="legend-title">Games</div>
  <div class="swatch-row"><i style:background="var(--map-cat-1)"></i> earlier</div>
  <div class="swatch-row"><i style:background="var(--map-cat-2)"></i> later</div>
  <div class="swatch-row"><i style:background="var(--muted-foreground)"></i> same year</div>
  <div class="swatch-row"><i class="hollow"></i> upcoming</div>
  <div class="legend-title rule">Links</div>
  <div class="swatch-row"><b class="solid"></b> similar</div>
  <div class="swatch-row"><b class="dashed"></b> same family</div>
  <div class="swatch-row"><b class="double"></b> reimplementation / expansion</div>
</div>

<style>
  .mark {
    position: absolute; transform: translate(-50%, -50%); padding: 0.05rem 0.4rem;
    border: 1px solid var(--border); border-radius: 999px; background: var(--card); color: var(--foreground);
    font-size: 0.72rem; line-height: 1.3; white-space: nowrap; cursor: pointer;
  }
  .mark:hover, .mark:focus-visible { border-color: var(--primary); }
  .legend {
    position: absolute; right: 0.75rem; bottom: 0.75rem; padding: 0.45rem 0.6rem;
    border: 1px solid var(--border); border-radius: 0.375rem;
    background: color-mix(in oklch, var(--card) 88%, transparent);
    color: var(--muted-foreground); font-size: 0.75rem; line-height: 1.4; min-width: 9rem;
  }
  .legend-title { color: var(--foreground); font-weight: 600; margin-bottom: 0.25rem; }
  .legend-title.rule { margin-top: 0.4rem; }
  .swatch-row { display: flex; align-items: center; gap: 0.4rem; margin-top: 0.15rem; }
  .swatch-row i { width: 0.65rem; height: 0.65rem; border-radius: 50%; flex: none; }
  .swatch-row i.hollow { border: 1px dashed var(--foreground); }
  .swatch-row b { width: 1rem; height: 0; flex: none; border-top: 1.5px solid var(--foreground); }
  .swatch-row b.dashed { border-top-style: dashed; }
  .swatch-row b.double { border-top-style: double; border-top-width: 4px; }
</style>
```

Check before moving on: `palette.ts`'s `MapTheme` has `chart`, `muted`, `accent`, `background`, `foreground` (it does — `readTheme`), and `--map-cat-1/2` are the CSS variables `chart[0]/[1]` read. If `chart[0]`'s variable name differs, match the legend swatches to it.

- [ ] **Step 2: Type-check**

Run: `pnpm run check`
Expected: 0 errors in `GenealogyLayer.svelte`. (It is exercised for real in Task 7 on Phil's dev server.)

- [ ] **Step 3: Commit and push**

```bash
git add src/lib/map/GenealogyLayer.svelte
git commit -m "feat(genealogy): the genealogy layer on the regl canvas

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
git push
```

---

### Task 7: The `/dev/genealogy` page

**Files:**
- Modify: `src/lib/catalog/GameSearch.svelte`
- Create: `src/routes/(app)/dev/genealogy/+page.server.ts`
- Create: `src/routes/(app)/dev/genealogy/+page.svelte`

**Interfaces:**
- Consumes: everything above; `loadMap` (`map/load.ts`), `initCatalog`/`catalog` (`catalog/catalog.svelte`), `GAMES` (`map/story.ts`), `PointCanvas`, `SegGroup` (`$lib/catalog/rail/SegGroup.svelte`, props `options/value/onchange/ariaLabel`), `Button` (`$lib/components/ui/button`), SvelteKit `page` (`$app/state`) and shallow `pushState`/`replaceState` (`$app/navigation`).
- Produces: `GameSearch` accepts `onpick?: (id: number) => void`; when given, picking calls it instead of navigating to `/games/{id}`.

- [ ] **Step 1: `GameSearch` gets `onpick`**

In `src/lib/catalog/GameSearch.svelte` change the props line and `open`:

```ts
  let { compact = false, onpick }: {
    compact?: boolean;
    /** Pick a game in place instead of opening its page (e.g. /dev/genealogy's centre). */
    onpick?: (id: number) => void;
  } = $props();
```

```ts
  function open(id: number) {
    q = '';
    hits = [];
    active = false;
    if (onpick) onpick(id);
    else goto(`/games/${id}`);
  }
```

Update the component's doc comment: "…that navigates to the game's detail page, or hands the pick to `onpick`."

- [ ] **Step 2: Dev gate**

```ts
// src/routes/(app)/dev/genealogy/+page.server.ts
import { dev } from '$app/environment';
import { error } from '@sveltejs/kit';
import type { PageServerLoad } from './$types';

/**
 * Prototype: one game's genealogy over the embedding. Reads the dev-only similarity
 * dataset (full 64-d vectors), so dev-only by construction.
 */
export const load: PageServerLoad = () => {
	if (!dev) error(404);
};
```

- [ ] **Step 3: The page**

```svelte
<script lang="ts">
  /**
   * `/dev/genealogy` — one game's family tree over the embedding: earlier games like it
   * above, later ones below, same-year ones beside it, grown by unfolding (⊕) and
   * re-centring. Rules and encodings: docs/superpowers/specs/2026-10-12-game-genealogy-design.md.
   *
   * All tree state lives in the URL: a re-centre is a shallow `pushState` (Back undoes it,
   * unfolds and all); everything else is a `replaceState`.
   *
   * All copy PLACEHOLDER (Phil writes the copy).
   */
  import { onMount } from 'svelte';
  import { page } from '$app/state';
  import { pushState, replaceState } from '$app/navigation';
  import { initCatalog, catalog } from '$lib/catalog/catalog.svelte';
  import { loadMap } from '$lib/map/load';
  import type { CoordinateSet } from '$lib/map/coordinates';
  import type { GameFacts } from '$lib/map/facts';
  import { loadGenealogyData } from '$lib/map/genealogy-data';
  import { buildGenealogy, expandKey, type Dir, type GenealogyInput, type Link } from '$lib/map/genealogy';
  import { layoutGenealogy } from '$lib/map/genealogy-layout';
  import { fromParams, toParams, DEFAULT_CAP, type GenealogyState } from '$lib/map/genealogy-url';
  import { GAMES } from '$lib/map/story';
  import PointCanvas from '$lib/map/PointCanvas.svelte';
  import GenealogyLayer from '$lib/map/GenealogyLayer.svelte';
  import GameSearch from '$lib/catalog/GameSearch.svelte';
  import SegGroup from '$lib/catalog/rail/SegGroup.svelte';
  import { Button } from '$lib/components/ui/button';

  // --- data ------------------------------------------------------------------------------
  let coords = $state<CoordinateSet | null>(null);
  let facts = $state<GameFacts | null>(null);
  let data = $state.raw<GenealogyInput | null>(null);
  let loadError = $state<string | null>(null);

  onMount(async () => {
    try {
      await initCatalog();
      if (catalog.status !== 'ready') throw new Error(catalog.error ?? 'catalog failed to load');
      const loaded = await loadMap();
      coords = loaded.coords;
      facts = loaded.facts;
      data = await loadGenealogyData(loaded.coords, loaded.facts);
    } catch (e) {
      loadError = e instanceof Error ? e.message : String(e);
    }
  });

  // --- state (URL) -----------------------------------------------------------------------
  const s = $derived(fromParams(page.url.searchParams));
  function commit(next: GenealogyState, push = false) {
    const qs = toParams(next).toString();
    (push ? pushState : replaceState)(qs ? `?${qs}` : page.url.pathname, {});
  }

  const centreId = $derived(s.game ?? GAMES.agricola);
  const centre = $derived(coords?.index.get(centreId) ?? null);
  /** `linked` memo — valid for one threshold, so a new one per threshold. */
  const cache = $derived.by(() => { void s.t; return new Map<number, Link[]>(); });

  const tree = $derived.by(() => {
    if (!data || !coords || centre == null) return null;
    const index = coords.index;
    const unfolded = new Set(s.unfolded.map((id) => index.get(id)).filter((i): i is number => i != null));
    const expanded = new Set<string>();
    for (const key of s.expanded) {
      const [id, dir] = key.split(':');
      const i = index.get(Number(id));
      if (i != null) expanded.add(expandKey(i, dir as Dir));
    }
    return buildGenealogy({ ...data, cache }, centre, { threshold: s.t, cap: DEFAULT_CAP, unfolded, expanded });
  });
  const layout = $derived(tree && facts ? layoutGenealogy(tree, facts.year, s.y) : null);

  // --- interaction -----------------------------------------------------------------------
  /** Selected game's index; -1 for none. Not in the URL: it's a glance, not a place. */
  let selected = $state(-1);
  const selNode = $derived(tree?.nodes.find((nd) => nd.i === selected) ?? null);
  const idOf = (i: number) => coords!.ids[i];

  function recentre(id: number) {
    if (id === centreId) return;
    selected = -1;
    commit({ ...s, game: id, unfolded: [], expanded: [], trail: [...s.trail, centreId] }, true);
  }
  function crumb(k: number) {
    selected = -1;
    commit({ ...s, game: s.trail[k], unfolded: [], expanded: [], trail: s.trail.slice(0, k) }, true);
  }
  const unfold = (i: number) => commit({ ...s, unfolded: [...s.unfolded, idOf(i)] });
  const more = (i: number, dir: Dir) => commit({ ...s, expanded: [...s.expanded, `${idOf(i)}:${dir}`] });

  // PLACEHOLDER COPY (Phil)
  const KIND_LABEL = { related: 'reimplementation / expansion', family: 'same family', influence: 'similarity only' } as const;
  const noEarlier = $derived(!!tree && !tree.nodes.some((nd) => nd.side === 'up') && tree.centreHidden.up === 0);
  const noLater = $derived(!!tree && !tree.nodes.some((nd) => nd.side === 'down') && tree.centreHidden.down === 0);
</script>

<div class="page">
  <header class="top">
    <div>
      <p class="eyebrow">Dev only — prototype</p>
      <h1>Genealogy</h1>
      {#if facts}
        <nav class="trail" aria-label="Trail">
          {#each s.trail as id, k (k)}
            <button type="button" onclick={() => crumb(k)}>{facts.name(id)}</button><span aria-hidden="true">›</span>
          {/each}
          <strong>{facts.name(centreId)}</strong>
        </nav>
      {/if}
    </div>
    <div class="search"><GameSearch compact onpick={recentre} /></div>
  </header>

  <div class="controls">
    <SegGroup
      ariaLabel="Vertical axis"
      options={[{ value: 'year', label: 'Year' }, { value: 'gen', label: 'Generation' }]}
      value={s.y}
      onchange={(y) => commit({ ...s, y })}
    />
    <label>Similarity ≥
      <input type="range" min="0.5" max="0.99" step="0.01" value={s.t}
        onchange={(e) => commit({ ...s, t: Number(e.currentTarget.value) })} />
      {s.t.toFixed(2)}
    </label>
    {#if tree}<span class="muted">{tree.nodes.length} games</span>{/if}
  </div>

  <div class="body">
    <div class="canvas">
      {#if loadError}
        <div class="state error">Couldn’t load: {loadError}</div>
      {:else if !coords || !facts || !data}
        <div class="state">Loading {catalog.status === 'ready' ? 'embeddings' : 'catalog'}…</div>
      {:else if centre == null}
        <div class="state">{facts.name(centreId)} isn’t in the embedding.</div>
      {:else if tree && !tree.placeable}
        <div class="state">{facts.name(centreId)} has no year or no vector, so it can’t be placed in time.</div>
      {:else if layout}
        <PointCanvas lasso={false}>
          <GenealogyLayer {coords} {facts} {layout} {selected} onselect={(i) => (selected = i)} onunfold={unfold} onmore={more} />
        </PointCanvas>
        {#if noEarlier}<p class="empty above">No earlier games above this similarity.</p>{/if}
        {#if noLater}<p class="empty below">No later games above this similarity.</p>{/if}
      {/if}
    </div>

    {#if selNode && facts && coords}
      {@const id = coords.ids[selNode.i]}
      <aside class="side" aria-label="Selected game">
        <h2>{facts.name(id)}</h2>
        <p class="muted">
          {facts.year[selNode.i] || '—'} · {facts.usersRated[selNode.i].toLocaleString()} ratings{facts.upcoming[selNode.i] ? ' · upcoming' : ''}
        </p>
        {#if selNode.side !== 'centre' && selNode.kind}
          <p>Linked to {facts.name(idOf(selNode.via))} at {selNode.sim.toFixed(2)} — {KIND_LABEL[selNode.kind]}</p>
        {/if}
        <div class="actions">
          {#if selNode.side !== 'centre'}<Button size="sm" onclick={() => recentre(id)}>Centre on this</Button>{/if}
          <Button size="sm" variant="outline" href="/games/{id}">Game page</Button>
          <Button size="sm" variant="ghost" onclick={() => (selected = -1)}>Close</Button>
        </div>
      </aside>
    {/if}
  </div>
</div>

<style>
  .page { height: 100%; min-height: 0; display: flex; flex-direction: column; gap: var(--space-sm); }
  .top { display: flex; align-items: flex-end; justify-content: space-between; gap: var(--space-md); flex-wrap: wrap; }
  .eyebrow { color: var(--muted-foreground); font-size: 0.8rem; margin: 0; }
  h1 { margin: 0; }
  .trail { display: flex; flex-wrap: wrap; align-items: center; gap: 0.35rem; font-size: 0.9rem; }
  .trail button { color: var(--muted-foreground); text-decoration: underline; text-underline-offset: 2px; }
  .trail span { color: var(--muted-foreground); }
  .search { min-width: min(20rem, 100%); }
  .controls { display: flex; flex-wrap: wrap; gap: var(--space-md); align-items: center; font-size: 0.9rem; }
  .controls label { display: inline-flex; align-items: center; gap: 0.4rem; }
  .muted { color: var(--muted-foreground); font-size: 0.85rem; }
  .body { flex: 1 1 auto; min-height: 0; display: flex; gap: var(--space-md); }
  .canvas { flex: 1 1 auto; min-width: 0; min-height: 0; position: relative; }
  .side { flex: 0 0 18rem; display: flex; flex-direction: column; gap: 0.5rem; padding: var(--space-md); border: 1px solid var(--border); border-radius: var(--radius); background: var(--card); overflow-y: auto; }
  .side h2 { margin: 0; font-size: 1.05rem; }
  .side p { margin: 0; }
  .actions { display: flex; flex-wrap: wrap; gap: 0.4rem; }
  .state { position: absolute; inset: 0; display: grid; place-items: center; color: var(--muted-foreground); }
  .state.error { color: var(--destructive, var(--foreground)); }
  .empty { position: absolute; left: 50%; transform: translateX(-50%); margin: 0; color: var(--muted-foreground); font-size: 0.85rem; }
  .empty.above { top: 0.75rem; }
  .empty.below { bottom: 0.75rem; }
</style>
```

Note: if `GAMES` has no `agricola` key, use `GAMES.brass` (both exist in `map/story.ts` as of this plan).

- [ ] **Step 4: Type-check and test**

Run: `pnpm run check` then `pnpm vitest run src/lib/map src/lib/server/similar-explorer`
Expected: 0 type errors; all tests PASS. If `Button` rejects `href` or `size="sm"`, check `src/lib/components/ui/button/button.svelte`'s variant names and use those (the same file `/map` imports from).

- [ ] **Step 5: Commit and push**

```bash
git add src/lib/catalog/GameSearch.svelte "src/routes/(app)/dev/genealogy"
git commit -m "feat(genealogy): /dev/genealogy — a game's tree, unfolded in place, centred by search or click

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
git push
```

- [ ] **Step 6: Hand to Phil for a live look**

Do not start a server. Tell Phil: "On your `just dev`, open `http://localhost:5173/dev/genealogy?game=102794` (Caverna). If you said yes to Task 1 Step 6, the first load rebuilds the dataset (~40 s)." Things to look at with him, not fix unprompted:
- does 0.8 give sensible trees (Caverna, Gloomhaven 174430, Wingspan 266192, X-Wing 103885, Biblios 34219)? The default threshold is a tuning value;
- Year vs Generation readability;
- ⊕ / +N placement and the legend;
- **Back after "Centre on this" restores the previous tree, unfolds included.** This relies on SvelteKit shallow routing updating `page.url`. If Back changes the address bar but not the tree, switch the page to read state from `location.search` on a `popstate` listener (as `/map` reads `location` directly), and say so in the PR.

Wait for his feedback before changing anything.

---

### Task 8: Verify and open the PR

- [ ] **Step 1: Full verification**

Run: `just verify`
Expected: types, tests and build all pass. Paste failures verbatim if not, and fix before continuing.

- [ ] **Step 2: Check the branch has no merged PR, then push**

```bash
gh pr view --json state,mergedAt 2>/dev/null || echo "no PR yet"
git push
```

- [ ] **Step 3: Open the PR**

```bash
gh pr create --base main --title "feat(genealogy): a game's family tree over the embedding (dev)" --body "$(cat <<'EOF'
## What

`/dev/genealogy`: pick a game and see games like it laid out by time — earlier ones above, later below, same-year beside — and grow the tree by unfolding games in place.

- Similarity threshold is a slider; no popularity floor.
- Chained generations; each game appears once; the strongest 8 per unfold plus "+N more".
- Links marked as similarity only / same family / reimplementation or expansion.
- Year or Generation as the vertical axis; all state in the URL, so Back restores the previous tree.
- The dev similarity dataset is now stamped with its embedding version, and the page refuses to mix it with coordinates from a different run.

Spec: `docs/superpowers/specs/2026-10-12-game-genealogy-design.md`
Plan: `docs/superpowers/plans/2026-10-12-game-genealogy.md`

## Not in this PR

Per-game API and game-page view, public vectors artifact, fly-from-map, catalog-wide overview.

## Test plan

- [x] `just verify`
- [ ] Phil: live look on `/dev/genealogy`

🤖 Generated with [Claude Code](https://claude.com/claude-code)
EOF
)"
```

Give Phil the PR URL. Do not merge.
