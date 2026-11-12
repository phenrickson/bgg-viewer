import { describe, it, expect } from 'vitest';
import { shelfText } from './format';

describe('shelfText', () => {
	it('says how many copies are available', () => {
		expect(shelfText(2, 3)).toBe('2 of 3 available');
	});
	it('says a single copy is checked out', () => {
		expect(shelfText(0, 1)).toBe('Checked out');
	});
	it('says when every copy is out', () => {
		expect(shelfText(0, 4)).toBe('All 4 out');
	});
	// A checked-out count above the snapshot's copies (copies added since) mustn't read negative.
	it('never reports fewer than zero available', () => {
		expect(shelfText(-1, 2)).toBe('All 2 out');
	});
});
