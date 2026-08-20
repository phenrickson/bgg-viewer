export default {
	id: 'geek-vs-average',
	kind: 'scatter',
	title: 'Geek rating against average',
	note: 'PLACEHOLDER — the geek rating is Bayesian, so thinly-rated games are pulled toward the mean. That is the bend.',
	xLabel: 'Average rating',
	yLabel: 'Geek rating',
	cols: 'ROUND(average_rating,2) AS x, ROUND(geek_rating,2) AS y',
	where: 'geek_rating > 0 AND average_rating > 0'
};
