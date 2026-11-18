/**
 * Tooltip root settings shared by every chart on the analytics page. Portaled to the body and
 * kept inside the window: the chart areas clip their overflow, and a tooltip contained only to
 * its own chart ran off the page beside the cards at the edges. `bgg-tip` is styled in
 * AnalyticsView (globally, since the portaled tooltip leaves the page's own markup).
 */
export const tipRoot = {
	portal: true,
	contained: 'window',
	classes: { container: 'bgg-tip' }
} as const;
