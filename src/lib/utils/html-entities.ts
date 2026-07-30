/**
 * Decode the HTML entities BGG returns in game descriptions.
 *
 * We render descriptions as *text*, not HTML, so this can't be skipped — and it can't be
 * done by assigning `innerHTML` either: the detail page is server-rendered, and a DOM-based
 * decode would produce different output on the server than in the browser and break
 * hydration.
 *
 * BGG's XML API **double-encodes**: the corpus contains `&amp;ldquo;` and `&amp;#10;`, not
 * `&ldquo;` and `&#10;`. So one pass leaves you staring at a literal `&ldquo;` — decoding
 * runs twice, which is also what makes triple-encoded stragglers come out right. Ordinary
 * prose is unharmed by the second pass, because "Tom & Jerry" has nothing left to match.
 *
 * The table covers what actually appears in the corpus; anything else is left verbatim, which
 * fails visibly (you see `&thorn;`) rather than silently dropping a character.
 */
const NAMED: Record<string, string> = {
	amp: '&',
	lt: '<',
	gt: '>',
	quot: '"',
	apos: "'",
	nbsp: ' ',
	ldquo: '“',
	rdquo: '”',
	lsquo: '‘',
	rsquo: '’',
	ndash: '–',
	mdash: '—',
	hellip: '…',
	bull: '•',
	middot: '·',
	deg: '°',
	times: '×',
	frac12: '½',
	trade: '™',
	reg: '®',
	copy: '©',
	eacute: 'é',
	egrave: 'è',
	uuml: 'ü',
	ouml: 'ö',
	auml: 'ä',
	szlig: 'ß'
};

/** Guard against malformed references (`&#0;`, out-of-range) producing junk. */
function codePoint(n: number): string {
	if (!Number.isFinite(n) || n <= 0 || n > 0x10ffff) return '';
	return String.fromCodePoint(n);
}

function pass(s: string): string {
	return s
		.replace(/&#x([0-9a-f]+);/gi, (_, h: string) => codePoint(parseInt(h, 16)))
		.replace(/&#(\d+);/g, (_, d: string) => codePoint(Number(d)))
		.replace(/&([a-z][a-z0-9]*);/gi, (whole: string, name: string) => {
			const key = name.toLowerCase();
			return key in NAMED ? NAMED[key] : whole;
		});
}

export function decodeEntities(s: string | null | undefined): string {
	if (!s) return '';
	return pass(pass(s)).trim();
}
