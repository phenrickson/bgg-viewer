/**
 * A game's **primary category** — the one category it is shown as, out of the several BGG
 * tags it usually carries.
 *
 * This is not a second taxonomy. It is a *projection* of the catalog's own `categories`
 * array down to a single value, by first match against a curated priority order. The same
 * column answers both questions the site asks:
 *
 *   - "which games are wargames?" — set membership, `list_contains(categories, 'Wargame')`.
 *     That is what a filter means, and it is what `Scope.categories` compiles to.
 *   - "what colour is this point?" — a partition, exactly one bucket per game. That is what
 *     colour requires, and it is what this module provides.
 *
 * Filtering is any-of; colouring is exactly-one. Both over `categories`.
 *
 * Lives in `catalog/` rather than `map/` because the primary category is a property of a
 * game, not of a plot: a list row, a card and a point on the map should all be able to show
 * the same colour for the same game. It moved here from `map/categories.ts` when the map
 * stopped being the only thing that could say what kind of game something is.
 *
 * The seven slots are a **colouring budget, not a claim about games**. Seven is how many
 * validated categorical tokens the palette has (`--map-cat-1..7`); everything else is
 * "Other". Refining the list — splitting out deck-builders, say — is a change to this file
 * and nothing else.
 */

/** How many colour slots the palette offers. Codes run 1..CATEGORY_SLOTS; 0 is "Other". */
export const CATEGORY_SLOTS = 7;

/**
 * The categories worth colouring, **in colour-slot order**: the i-th label takes the i-th
 * `--map-cat-*` token, so reordering this list repaints every plot on the site.
 *
 * Hand-curated rather than taken from BGG's tag frequencies, which put format tags (Card
 * Game, Dice) and catch-alls (Animals) on top — true, and not what makes the landscape
 * legible. Trains has fewer than 600 games and earns a slot anyway, because 18xx is a
 * recognisable region of the map and reads as one.
 */
export const CATEGORIES: string[] = [
	'Trains',
	'Economic',
	'Wargame',
	'Party Game',
	"Children's Game",
	'Abstract Strategy',
	'Card Game'
];

/**
 * Which tag wins a game that carries several — the same members as `CATEGORIES`, ordered by
 * specificity rather than by colour slot. The more specific tag beats the broader one it
 * usually travels with:
 *
 *   Trains before Economic     — 18xx is a train game that happens to have an economy.
 *   Wargame before Economic    — Axis & Allies, Twilight Imperium: wargames with an
 *                                economy, not economic games with a war.
 *   Card Game last             — a format tag most of the others travel with, so it only
 *                                claims a game that is none of the more specific ones.
 */
export const CATEGORY_PRIORITY: string[] = [
	'Trains',
	'Wargame',
	'Economic',
	'Party Game',
	"Children's Game",
	'Abstract Strategy',
	'Card Game'
];

/** Display label for a code: `0` is Other, `1..CATEGORY_SLOTS` index into `CATEGORIES`. */
export const CATEGORY_LABELS: string[] = ['Other', ...CATEGORIES];

/** `--map-cat-N` for a code, or the faint "other" token for 0. CSS `var()`, not a value. */
export function categoryToken(code: number): string {
	return code > 0 && code <= CATEGORY_SLOTS ? `var(--map-cat-${code})` : 'var(--map-cat-other)';
}

/**
 * The SQL expression that derives the primary-category code from the catalog's `categories`
 * array — a `CASE` tested in priority order, coded by colour slot.
 *
 * Exported as an expression rather than a whole query so any caller can select it beside
 * whatever else it needs. Labels are escaped; they are module constants rather than user
 * input, but a curated list is exactly the kind of thing that later grows a quote in it.
 */
export function primaryCategorySql(
	labels: string[] = CATEGORIES,
	/** Defaults to `CATEGORY_PRIORITY`, or to `labels` itself when a custom list is given. */
	priority?: string[]
): string {
	priority ??= labels === CATEGORIES ? CATEGORY_PRIORITY : labels;
	const esc = (s: string) => s.replace(/'/g, "''");
	const slots = labels.slice(0, CATEGORY_SLOTS);
	if (!slots.length) return '0';
	const cases = priority
		.filter((l) => slots.includes(l))
		.map((l) => `WHEN list_contains(categories, '${esc(l)}') THEN ${slots.indexOf(l) + 1}`)
		.join(' ');
	return `CASE ${cases} ELSE 0 END`;
}
