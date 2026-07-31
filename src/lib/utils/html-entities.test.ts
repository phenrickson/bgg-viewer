import { describe, it, expect } from 'vitest';
import { decodeEntities } from './html-entities';

describe('decodeEntities', () => {
	it('is empty for nullish or blank input', () => {
		expect(decodeEntities(null)).toBe('');
		expect(decodeEntities(undefined)).toBe('');
		expect(decodeEntities('   ')).toBe('');
	});

	it('decodes the double encoding BGG actually sends', () => {
		// The real corpus: entities arrive with their ampersand encoded too.
		expect(decodeEntities('a &amp;ldquo;Choose Your Own&amp;rdquo; book')).toBe(
			'a “Choose Your Own” book'
		);
		expect(decodeEntities('line one&amp;#10;line two')).toBe('line one\nline two');
	});

	it('decodes singly-encoded text too', () => {
		expect(decodeEntities('&ldquo;quoted&rdquo; &mdash; and &hellip;')).toBe('“quoted” — and …');
		expect(decodeEntities('4&#215;4')).toBe('4×4');
		expect(decodeEntities('&#x27;hex&#x27;')).toBe("'hex'");
	});

	it('leaves ordinary prose with an ampersand alone', () => {
		// The second pass must not find anything to chew on here.
		expect(decodeEntities('Tom &amp; Jerry &amp; Co')).toBe('Tom & Jerry & Co');
	});

	it('passes unknown entities through visibly rather than dropping them', () => {
		expect(decodeEntities('&thorn; stays')).toBe('&thorn; stays');
	});

	it('drops malformed numeric references instead of emitting junk', () => {
		expect(decodeEntities('a&#0;b')).toBe('ab');
		expect(decodeEntities('a&#99999999;b')).toBe('ab');
	});

	it('handles the accented names in designer-heavy descriptions', () => {
		expect(decodeEntities('Andr&eacute; &amp; J&uuml;rgen')).toBe('André & Jürgen');
	});
});
