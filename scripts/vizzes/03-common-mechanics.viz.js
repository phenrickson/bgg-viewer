import { topOf } from './lib.js';

export default {
	id: 'common-mechanics',
	kind: 'bars',
	title: 'The most common mechanics',
	note: 'The most popular game mechanics on BoardGameGeek',
	xLabel: 'Games',
	yLabel: 'Mechanic',
	query: topOf('mechanics', 12)
};
