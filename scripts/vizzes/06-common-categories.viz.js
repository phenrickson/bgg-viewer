import { topOf } from './lib.js';

export default {
	id: 'common-categories',
	kind: 'bars',
	title: 'The most common categories',
	note: 'PLACEHOLDER — how often each category appears across the catalog.',
	xLabel: 'Games',
	yLabel: 'Category',
	query: topOf('categories', 12)
};
