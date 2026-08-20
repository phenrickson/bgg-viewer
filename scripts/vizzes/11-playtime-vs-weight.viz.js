export default {
	id: 'playtime-vs-weight',
	kind: 'scatter',
	title: 'Playing time vs complexity',
	note: 'Unsurprisingly, games with longer playing times tend to be more complex.',
	xLabel: 'Minutes',
	yLabel: 'Complexity',
	// `max_playtime` is the upper bound of the stated range — there is no single
	// `playing_time` column on games_features.
	cols: 'LOG(max_playtime) AS x, average_weight AS y',
	// `max_playtime > 0` is load-bearing: LOG(0) is a hard BigQuery error (not just a bad
	// point), and some games have an unset/zero playtime.
	where: 'average_weight > 0 AND max_playtime > 0'
};
