import { topOf } from './lib.js';

export default {
	id: 'prolific-designers',
	kind: 'bars',
	title: 'The most prolific designers',
	note: 'Designers with the most credited games on BoardGameGeek.',
	xLabel: 'Games',
	yLabel: 'Designer',
	query: topOf('designers', 15, ['(Uncredited)'])
};
