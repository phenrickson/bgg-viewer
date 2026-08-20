import { topOf } from './lib.js';

export default {
	id: 'prolific-designers',
	kind: 'bars',
	title: 'The most prolific designers',
	note: 'PLACEHOLDER — credited games per designer across the catalog.',
	xLabel: 'Games',
	yLabel: 'Designer',
	query: topOf('designers', 12, ['(Uncredited)'])
};
