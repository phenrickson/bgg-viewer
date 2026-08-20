export default {
	id: 'popularity-vs-rating',
	kind: 'scatter',
	title: 'Popularity vs rating',
	note: 'Note the log scale on the left.',
	xLabel: 'Average rating',
	yLabel: 'Popularity (logged)',
	cols: 'average_rating AS x, log(users_rated) AS y',
	where: 'geek_rating > 0',
	// Ratings run from 30 to ~135,000. Linear, that is one clump against the axis and a
	// handful of outliers strung out to the right; the shape only exists in log space.
	opts: { xLog: true }
};
