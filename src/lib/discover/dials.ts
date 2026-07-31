/**
 * Discover's whole vocabulary, in one file.
 *
 * Discover asks three coarse questions where Explore offers a rail of precise ones. Each
 * chip is a patch on the SAME `Scope` Explore uses, so the two pages are two views of one
 * query — which is what makes "see all N in Explore" a link rather than a translation.
 *
 * Keep this list short. A fourth dial is the failure mode Discover exists to avoid.
 */
import type { Scope } from '$lib/catalog/scope';

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
 *   Wargame 5,344 · Fantasy 4,768 · Party Game 3,590 · Cooperative Game 3,425 ·
 *   Abstract Strategy 2,518 · Economic 2,274
 *
 * A balanced 2.3k–5.3k band, so no chip dominates. `Card Game` was considered and rejected:
 * at 11,517 games spanning every kind of play, it barely narrows anything.
 *
 * "Cooperative" is a MECHANIC, not a category — hence `field`. Earlier drafts also proposed
 * Strategy / Family / Thematic on the theory that BGG's subdomains live in `families`; they
 * do not (that column holds Kickstarter tags, admin flags, and component notes), so those
 * labels have no backing values and are absent.
 */
export const CATEGORY_CHIPS: CategoryChip[] = [
  { label: 'Wargame', field: 'categories', value: 'Wargame' },
  { label: 'Fantasy', field: 'categories', value: 'Fantasy' },
  { label: 'Party Game', field: 'categories', value: 'Party Game' },
  { label: 'Cooperative', field: 'mechanics', value: 'Cooperative Game' },
  { label: 'Abstract', field: 'categories', value: 'Abstract Strategy' },
  { label: 'Economic', field: 'categories', value: 'Economic' }
];

/**
 * "Best at N" — the community's vote, not the box's min/max range. This is the flagship
 * filter BGG itself cannot do, which is why it earns a whole dial on a three-dial page.
 */
export const PLAYER_CHIPS: { label: string; bestAt: number }[] = [
  { label: '1', bestAt: 1 },
  { label: '2', bestAt: 2 },
  { label: '3', bestAt: 3 },
  { label: '4', bestAt: 4 },
  { label: '5', bestAt: 5 },
  { label: '6', bestAt: 6 }
];

export interface ComplexityBand {
  label: string;
  /** Inclusive lower bound; null = open. */
  min: number | null;
  /** Exclusive upper bound; null = open. */
  max: number | null;
}

/**
 * The 1–5 weight scale, banded into words. Contiguous and single-select, so "Light" and
 * "Heavy" can never both be on. Boundaries fall in the UPPER band (a 3.0 game is
 * Medium-Heavy, not Medium) — one rule, applied consistently, so a game never lands in two.
 */
export const COMPLEXITY_BANDS: ComplexityBand[] = [
  { label: 'Light', min: null, max: 2.0 },
  { label: 'Medium-Light', min: 2.0, max: 2.5 },
  { label: 'Medium', min: 2.5, max: 3.0 },
  { label: 'Medium-Heavy', min: 3.0, max: 3.5 },
  { label: 'Heavy', min: 3.5, max: null }
];

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
  if (weight == null || !Number.isFinite(weight)) return null;
  for (const b of COMPLEXITY_BANDS) {
    const aboveMin = b.min == null || weight >= b.min;
    const belowMax = b.max == null || weight < b.max;
    if (aboveMin && belowMax) return b.label;
  }
  return COMPLEXITY_BANDS[COMPLEXITY_BANDS.length - 1].label;
}
