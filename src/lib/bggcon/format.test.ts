import { describe, it, expect } from 'vitest';
import { shelfText, shelfLabel } from './format';

describe('shelfText', () => {
	it('is available over copies', () => {
		expect(shelfText(2, 3)).toBe('2/3 available');
		expect(shelfText(1, 1)).toBe('1/1 available');
	});
	it('is 0 over copies when every copy is out', () => {
		expect(shelfText(0, 4)).toBe('0/4 available');
	});
	// A checked-out count above the snapshot's copies (copies added since) mustn't read negative.
	it('never reports fewer than zero available', () => {
		expect(shelfText(-1, 2)).toBe('0/2 available');
	});
});

describe('shelfLabel', () => {
	// The words behind "2/3", for a tooltip and screen readers.
	it('spells it out', () => {
		expect(shelfLabel(2, 3)).toBe('2 of 3 copies available');
		expect(shelfLabel(1, 1)).toBe('1 of 1 copy available');
		expect(shelfLabel(-1, 2)).toBe('0 of 2 copies available');
	});
});
