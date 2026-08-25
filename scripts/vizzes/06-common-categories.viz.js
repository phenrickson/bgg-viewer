import { topOf } from './lib.js';

export default {
	id: 'common-categories',
	kind: 'bars',
	title: 'The most common categories',
	note: 'The most popular categories on BoardGameGeek',
	xLabel: 'Games',
	yLabel: 'Category',
	query: topOf('categories', 15)
};
