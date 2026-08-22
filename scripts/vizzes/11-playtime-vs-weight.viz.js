export default {
	id: 'playtime-vs-weight',
	kind: 'scatter',
	title: 'Playing time vs complexity',
	note: 'Unsurprisingly, games that take longer tend to be more complex.',
	xLabel: 'Playing time (in minutes)',
	yLabel: 'Complexity',
	cols: 'max_playtime AS x, average_weight AS y',
	// `max_playtime > 0` excludes unset/zero data — not a real "0-minute" game, just missing
	// data. `max_playtime < 5000` drops the multi-day wargame outliers (some run past 80,000
	// minutes) that otherwise stretch the axis far past anything a recognizable game occupies.
	where: 'average_weight > 0 AND max_playtime > 0 AND max_playtime < 5000',
	opts: { xLog: true }
};
