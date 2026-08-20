export default {
	id: 'complexity-vs-rating',
	kind: 'scatter',
	title: 'Complexity against rating',
	note: 'PLACEHOLDER — a sample of the catalog stratified across ratings; named games are called out on top.',
	xLabel: 'Complexity',
	yLabel: 'Average rating',
	cols: 'ROUND(average_weight,2) AS x, ROUND(average_rating,2) AS y',
	where: 'average_weight > 0 AND average_rating > 0'
};
