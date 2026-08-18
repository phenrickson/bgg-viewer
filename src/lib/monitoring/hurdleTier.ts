/**
 * Badge tier for a game's `predicted_hurdle_prob`. Purely a display decision — the
 * backend returns the raw probability, and these cutoffs live here so they can be
 * retuned without touching the data path.
 */
export type HurdleTier = 'standout' | 'promising' | null;

export function hurdleTier(prob: number | null): HurdleTier {
	if (prob == null) return null;
	if (prob >= 0.7) return 'standout';
	if (prob >= 0.5) return 'promising';
	return null;
}
