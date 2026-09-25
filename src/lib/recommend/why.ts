/**
 * "Why are these two games similar?" — level 1: what they share on the embedding's own inputs.
 *
 * Every trait here is something the structural embedding (bgg-predictive-models,
 * `src/models/embeddings/`) actually reads, and is read the way it reads it:
 *
 *   · complexity  → `predicted_complexity`, not BGG's voted `average_weight`
 *   · players     → the box's min–max, not BGG's best-at votes
 *   · play time   → the box's min–max minutes
 *   · tags        → mechanics and categories in full; families only under the embedding's
 *                   allowlist; any tag on fewer than MIN_TAG_GAMES games dropped, as the
 *                   model's `min_feature_count` drops it
 *
 * Showing a trait the model never sees as a *reason* for a match would be false, so the
 * filters mirror the model rather than a notion of what's interesting.
 *
 * Pure: two catalog rows and the catalog's tag frequencies in, a comparison out. The page
 * owns the DuckDB queries; this file can be tested without them.
 */
import { formatMinutes } from '$lib/catalog/playtime';

/**
 * The family prefixes the embedding keeps — a copy of `DEFAULT_EMBEDDING_FAMILY_PATTERNS` in
 * bgg-predictive-models `src/models/embeddings/transformer.py`. Keep the two in step.
 * (The model also caps families at its 150 most frequent; that cut needs the fitted
 * transformer, so it isn't reproduced — a rare family sorts last under rarest-first anyway.)
 */
export const EMBEDDING_FAMILY_PATTERNS: readonly RegExp[] = [
	/^Players:/,
	/^Category/,
	/^Sports/,
	/^Traditional/,
	/^Card/,
	/^Collectible/
];

/** `embeddings.min_feature_count` in bgg-predictive-models `config.yaml`. */
export const MIN_TAG_GAMES = 10;

/** Two predicted complexities this close read as "both ~X". */
export const COMPLEXITY_CLOSE = 0.5;

/** The slice of a catalog row the comparison reads. */
export interface WhyRow {
	predicted_complexity: number | null;
	min_players: number | null;
	max_players: number | null;
	min_playtime: number | null;
	max_playtime: number | null;
	mechanics: readonly string[] | null;
	categories: readonly string[] | null;
	families: readonly string[] | null;
}

export type TagKind = 'mechanics' | 'categories' | 'families';

/** Games per tag across the catalog, one map per kind. */
export type TagFrequencies = Record<TagKind, ReadonlyMap<string, number>>;

export type Span = readonly [number, number];

export interface SpanCompare {
	a: Span;
	b: Span;
	/** The stretch both cover, or null when they don't meet. */
	overlap: Span | null;
}

export interface Why {
	complexity: { a: number; b: number; close: boolean } | null;
	players: SpanCompare | null;
	playtime: SpanCompare | null;
	/** Shared tags per kind, rarest first. */
	shared: Record<TagKind, string[]>;
}

/** A row's min–max as a span. A missing end takes the other's value; nothing → null. */
function span(min: number | null, max: number | null): Span | null {
	const lo = min != null && min > 0 ? min : null;
	const hi = max != null && max > 0 ? max : null;
	if (lo == null && hi == null) return null;
	const a = lo ?? hi!;
	const b = hi ?? lo!;
	return a <= b ? [a, b] : [b, a];
}

function compareSpans(a: Span | null, b: Span | null): SpanCompare | null {
	if (!a || !b) return null;
	const lo = Math.max(a[0], b[0]);
	const hi = Math.min(a[1], b[1]);
	return { a, b, overlap: lo <= hi ? [lo, hi] : null };
}

function sharedTags(
	a: readonly string[] | null,
	b: readonly string[] | null,
	freq: ReadonlyMap<string, number>,
	keep: (tag: string) => boolean = () => true
): string[] {
	if (!a?.length || !b?.length) return [];
	const inB = new Set(b);
	// An empty map means the counts haven't loaded: show the tags unfiltered rather than none.
	const counted = freq.size > 0;
	return [...new Set(a)]
		.filter((t) => inB.has(t) && keep(t))
		.filter((t) => !counted || (freq.get(t) ?? 0) >= MIN_TAG_GAMES)
		.sort((x, y) => (freq.get(x) ?? 0) - (freq.get(y) ?? 0) || x.localeCompare(y));
}

export const isEmbeddingFamily = (family: string): boolean =>
	EMBEDDING_FAMILY_PATTERNS.some((p) => p.test(family));

/** Compare a seed (`a`) with a candidate (`b`). */
export function explain(a: WhyRow, b: WhyRow, freq: TagFrequencies): Why {
	const ca = a.predicted_complexity;
	const cb = b.predicted_complexity;
	return {
		complexity:
			ca != null && cb != null ? { a: ca, b: cb, close: Math.abs(ca - cb) <= COMPLEXITY_CLOSE } : null,
		players: compareSpans(span(a.min_players, a.max_players), span(b.min_players, b.max_players)),
		playtime: compareSpans(span(a.min_playtime, a.max_playtime), span(b.min_playtime, b.max_playtime)),
		shared: {
			mechanics: sharedTags(a.mechanics, b.mechanics, freq.mechanics),
			categories: sharedTags(a.categories, b.categories, freq.categories),
			families: sharedTags(a.families, b.families, freq.families, isEmbeddingFamily)
		}
	};
}

// --- reading it out -----------------------------------------------------------------------
// PLACEHOLDER copy (Phil): the phrasings below are stand-ins.

const players = ([lo, hi]: Span) => (lo === hi ? `${lo}` : `${lo}–${hi}`);
const minutes = ([lo, hi]: Span) =>
	lo === hi ? formatMinutes(lo) : `${formatMinutes(lo)}–${formatMinutes(hi)}`;
const weight = (n: number) => n.toFixed(1);

export function complexityText(c: NonNullable<Why['complexity']>): string {
	return c.close ? `both ~${weight((c.a + c.b) / 2)}` : `${weight(c.a)} vs ${weight(c.b)}`;
}

export function playersText(p: SpanCompare): string {
	return p.overlap ? `both play ${players(p.overlap)}` : `${players(p.a)} vs ${players(p.b)}`;
}

export function playtimeText(p: SpanCompare): string {
	return p.overlap ? `both fit ${minutes(p.overlap)}` : `${minutes(p.a)} vs ${minutes(p.b)}`;
}

/**
 * The one-line why: the first two scalar traits that match, then the rarest shared
 * mechanic (or category, when no mechanic is shared). Only what they have IN COMMON — the
 * differences belong to the full panel.
 */
export function whyLine(w: Why): string[] {
	const parts: string[] = [];
	if (w.complexity?.close) parts.push(`Both ~${weight((w.complexity.a + w.complexity.b) / 2)}`);
	if (w.players?.overlap) parts.push(`${players(w.players.overlap)} players`);
	if (w.playtime?.overlap) parts.push(minutes(w.playtime.overlap));
	const tag = w.shared.mechanics[0] ?? w.shared.categories[0];
	return tag ? [...parts.slice(0, 2), tag] : parts.slice(0, 2);
}
