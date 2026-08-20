export default {
	id: 'popularity-vs-rating',
	kind: 'scatter',
	title: 'Popularity against rating',
	note: 'PLACEHOLDER — how many people rated a game against how it scores. Note the log scale on the left.',
	xLabel: 'Ratings',
	yLabel: 'Geek rating',
	cols: 'users_rated AS x, ROUND(geek_rating,2) AS y',
	where: 'geek_rating > 0',
	// Ratings run from 30 to ~135,000. Linear, that is one clump against the axis and a
	// handful of outliers strung out to the right; the shape only exists in log space.
	opts: { xLog: true }
};
