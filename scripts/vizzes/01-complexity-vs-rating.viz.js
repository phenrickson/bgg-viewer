export default {
	id: 'complexity-vs-rating',
	kind: 'scatter',
	title: 'Complexity vs rating',
	note: 'Higher complexity tends to be associated with a higher rating; BoardGameGeek users like complex games.',
	xLabel: 'Complexity',
	yLabel: 'Average rating',
	cols: 'ROUND(average_weight,2) AS x, ROUND(average_rating,2) AS y',
	where: 'average_weight > 0 AND average_rating > 0'
};
