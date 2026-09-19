/**
 * The categories the map colours by — hand-curated, like the anchors. BGG's own tag
 * frequencies put format tags (Card Game, Dice) and catch-alls (Animals) at the top, which
 * is not what makes the landscape legible; Trains has fewer than 600 games and belongs here
 * anyway.
 *
 * ORDER IS PRIORITY: a game carrying several of these takes the first one listed, so put
 * the more specific tag before the broader one it usually travels with (Trains before
 * Economic; Wargame before Economic — Axis & Allies, Twilight Imperium and most grand
 * strategy carry both, and they are wargames with an economy, not the reverse). At most
 * seven — one per chart colour token; anything else is "Other". Card Game last: it's a
 * format tag most of the others travel with, so it only claims a game that is none of the
 * more specific ones.
 */
export const CATEGORIES: string[] = [
	'Trains',
	'Wargame',
	'Economic',
	'Party Game',
	"Children's Game",
	'Abstract Strategy',
	'Card Game'
];
