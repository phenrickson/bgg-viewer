/**
 * Content measure — how wide a region is allowed to get before extra width stops helping.
 *
 * Lives here, not in a route, because it is a property of the *kind* of surface rather than of
 * any one page: a reading column, a record page and a two-pane workspace each have a width past
 * which they get worse, and those three answers should be stated once. A `max-width` in a
 * page's `<style>` is the same decision made privately, with a number nobody else can find.
 */
export const MEASURE = {
	/** A reading column — prose, hero copy. Long lines are hard to track back from. */
	prose: '52rem',
	/**
	 * A list of records — rows carrying a few fields each. Wider than prose, because a row
	 * is not a sentence and cramping it truncates real content; narrower than a record page,
	 * because a list still scans top-to-bottom and a long row loses its own left edge.
	 */
	list: '64rem',
	/** A record page: headline, stats, supporting panels. */
	content: '80rem',
	/** A two-pane workspace — a filter rail beside a dense list. */
	wide: '112rem',
	/** Opt out: canvases, maps, anything whose job is to be as big as the screen. */
	full: 'none'
} as const;
export type Measure = keyof typeof MEASURE;
export const measure = (m: Measure = 'content') => MEASURE[m] ?? MEASURE.content;

export const COL_MIN = { sm: '9.375rem', md: '14.375rem', lg: '21.25rem', xl: '27.5rem' } as const;
export type ColMin = keyof typeof COL_MIN;
export const GAP = { sm: 'var(--space-sm)', md: 'var(--space-md)', lg: 'var(--space-lg)' } as const;
export type Gap = keyof typeof GAP;
export const SPLIT_BASIS = { half: '50%', 'aside-narrow': '34%', 'aside-wide': '40%' } as const;
export type SplitRatio = keyof typeof SPLIT_BASIS;
export type SplitAt = 'sm' | 'md';
export const colMin = (m: ColMin = 'md') => COL_MIN[m] ?? COL_MIN.md;
export const gapVar = (g: Gap = 'md') => GAP[g] ?? GAP.md;
export const splitBasis = (r: SplitRatio = 'aside-narrow') => SPLIT_BASIS[r] ?? SPLIT_BASIS['aside-narrow'];
