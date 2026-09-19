/**
 * The categories the map colours by — hand-curated, like the anchors. BGG's own tag
 * frequencies put format tags (Card Game, Dice) and catch-alls (Animals) at the top, which
 * is not what makes the landscape legible; Trains has fewer than 600 games and belongs here
 * anyway.
 *
 * ORDER IS COLOUR: the i-th label takes the i-th chart colour token, so reordering this
 * list repaints the map. At most seven — one per token; anything else is "Other".
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
 * Which tag wins a game that carries several: the more specific before the broader one it
 * usually travels with. Trains before Economic (18xx); Wargame before Economic (Axis &
 * Allies, Twilight Imperium — wargames with an economy, not the reverse). Card Game last:
 * it's a format tag most of the others travel with, so it only claims a game that is none
 * of the more specific ones. Same members as CATEGORIES; only the order differs.
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
