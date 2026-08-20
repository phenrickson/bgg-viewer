export default {
	id: 'playtime-vs-weight',
	kind: 'scatter',
	title: 'Playing time against complexity',
	note: 'PLACEHOLDER — stated playing time against community weight, over a sample stratified across ratings.',
	xLabel: 'Minutes',
	yLabel: 'Complexity',
	// `max_playtime` is the upper bound of the stated range — there is no single
	// `playing_time` column on games_features.
	cols: 'max_playtime AS x, ROUND(average_weight,2) AS y',
	where: 'average_weight > 0 AND max_playtime BETWEEN 10 AND 300'
};
