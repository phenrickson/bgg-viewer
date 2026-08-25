export default {
	id: 'geek-vs-average',
	kind: 'scatter',
	title: 'Geek rating against average',
	note: 'The geek rating is Bayesian, so games with few ratings are pulled towards the mean (5.5).',
	xLabel: 'Average rating',
	yLabel: 'Geek rating',
	cols: 'ROUND(average_rating,2) AS x, ROUND(geek_rating,2) AS y',
	where: 'geek_rating > 0 AND average_rating > 0'
};
