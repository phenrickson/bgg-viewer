/**
 * Discover's whole vocabulary, in one file.
 *
 * Discover asks three coarse questions where Explore offers a rail of precise ones. Each
 * chip is a patch on the SAME `Scope` Explore uses, so the two pages are two views of one
 * query — which is what makes "see all N in Explore" a link rather than a translation.
 *
 * Keep this list short. A fourth dial is the failure mode Discover exists to avoid.
 */
import type { Scope, ComplexityBand } from '$lib/catalog/scope';
import { scopeFromParams, COMPLEXITY_BANDS, complexityBandIndex } from '$lib/catalog/scope';

export interface CategoryChip {
  label: string;
  /** Which artifact column backs this label. */
  field: 'categories' | 'mechanics';
  /** The exact value as it appears in the artifact. */
  value: string;
}

/**
 * Six chips, every value verified present in the cached artifact (35,265 rows) with its
 * game count. Counts are why this set and not another:
 *
 *   Fantasy 4,768 · Party Game 3,590 · Cooperative Game 3,425 · Economic 2,274 ·
 *   Abstract Strategy 2,518 · Wargame 5,344
 *
 * A balanced 2.3k–5.3k band, so no chip dominates. `Card Game` was considered and rejected:
 * at 11,517 games spanning every kind of play, it barely narrows anything.
 *
 * Ordered by breadth of appeal, not by count: this is the first thing a newcomer reads, and
 * opening on Wargame sets a specialist tone for a page whose job is to feel welcoming. It
 * goes last for the same reason, despite having the largest count of the six.
 *
 * `label` is not `value`: "Party" reads better beside single-word neighbours than the
 * artifact's "Party Game" does. "Cooperative" is a MECHANIC, not a category — hence `field`.
 * Earlier drafts also proposed
 * Strategy / Family / Thematic on the theory that BGG's subdomains live in `families`; they
 * do not (that column holds Kickstarter tags, admin flags, and component notes), so those
 * labels have no backing values and are absent.
 */
export const CATEGORY_CHIPS: CategoryChip[] = [
  { label: 'Fantasy', field: 'categories', value: 'Fantasy' },
  { label: 'Party', field: 'categories', value: 'Party Game' },
  { label: 'Cooperative', field: 'mechanics', value: 'Cooperative Game' },
  { label: 'Economic', field: 'categories', value: 'Economic' },
  { label: 'Abstract', field: 'categories', value: 'Abstract Strategy' },
  { label: 'Wargame', field: 'categories', value: 'Wargame' }
];

/**
 * "Best at N" — the community's vote, not the box's min/max range. This is the flagship
 * filter BGG itself cannot do, which is why it earns a whole dial on a three-dial page.
 */
export const PLAYER_CHIPS: { label: string; bestAt: number }[] = [
  { label: 'Just me', bestAt: 1 },
  { label: '2 players', bestAt: 2 },
  { label: '3 players', bestAt: 3 },
  { label: '4 players', bestAt: 4 },
  { label: '5 players', bestAt: 5 },
  { label: '6 players', bestAt: 6 }
];

/**
 * How many games Discover shows. It is a recommendation, not a result set — a bare digit
 * answers a question nobody asked, and 30,000 rows is Explore's job. The count line still
 * reports the true match total, and the door at the foot of the page carries the scope
 * there, so nothing is hidden by the bound.
 */
export const DISCOVER_LIMIT = 25;

/**
 * The bands (and the weight→band lookup) moved to `catalog/scope.ts` — `toWhere` needs the
 * cutoffs to compile the `weightBands` predicate, and `ComplexityMeter` (shared between
 * Discover and Explore) needs the lookup too. Re-exported so Discover's callers keep
 * importing them from here.
 */
export { COMPLEXITY_BANDS, type ComplexityBand, complexityBandIndex };

/**
 * Discover's URL-to-scope entry point. A plain alias, kept as its own named function for
 * Discover's call site rather than importing `scopeFromParams` directly — Discover's default
 * ("top rated, all-time") and Explore's shared default (`DEFAULT_SCOPE.universe`, in
 * `catalog/scope.ts`) both resolve to `rated` now, so there is no longer a distinct override
 * to make here; an explicit `?u=top10k` carried in from a link is still honoured either way.
 */
export function discoverScopeFromParams(params: URLSearchParams): Scope {
  return scopeFromParams(params);
}

export function isCategoryOn(scope: Scope, chip: CategoryChip): boolean {
  return scope[chip.field].includes(chip.value);
}

/** Add or remove one chip's value, leaving every other selection alone. */
export function toggleCategory(scope: Scope, chip: CategoryChip): Partial<Scope> {
  const current = scope[chip.field];
  const next = isCategoryOn(scope, chip)
    ? current.filter((v) => v !== chip.value)
    : [...current, chip.value];
  return { [chip.field]: next } as Partial<Scope>;
}

export function isBandOn(scope: Scope, band: ComplexityBand): boolean {
  return scope.weightMin === band.min && scope.weightMax === band.max;
}

/** Single-select: apply the band, or clear it if it is already the active one. */
export function bandPatch(scope: Scope, band: ComplexityBand): Partial<Scope> {
  if (isBandOn(scope, band)) return { weightMin: null, weightMax: null };
  return { weightMin: band.min, weightMax: band.max };
}

/**
 * A weight as the word Discover shows instead of the number. Null weight → null, so the
 * caller renders nothing rather than a misleading "Light".
 */
export function complexityLabel(weight: number | null): string | null {
  const idx = complexityBandIndex(weight);
  return idx === 0 ? null : COMPLEXITY_BANDS[idx - 1].label;
}
