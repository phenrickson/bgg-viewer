import { topOf } from './lib.js';

export default {
	id: 'common-mechanics',
	kind: 'bars',
	title: 'The most common mechanics',
	note: 'PLACEHOLDER — how often each mechanic appears across the catalog.',
	xLabel: 'Games',
	yLabel: 'Mechanic',
	query: topOf('mechanics', 12)
};
