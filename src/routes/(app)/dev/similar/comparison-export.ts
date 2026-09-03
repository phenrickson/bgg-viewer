/**
 * "Look at these lists" export for the tuning bench.
 *
 * `buildComparisonHtml` bakes a 2- or 3-experiment panel comparison into ONE
 * self-contained HTML file: open by double-click, no server. It is a **read-only
 * snapshot** — the same side-by-side table the bench shows, with the real experiment
 * names on it. No blinding, no voting, no answer file (that's `review.ts`). You hand
 * it to someone so they can see what each tuning produces.
 *
 * Dev-only, like the rest of /dev/similar — none of this ships.
 */

export interface ComparisonItem {
	id: number;
	name: string;
	year: number | null;
}

export interface ComparisonGame {
	id: number;
	name: string;
	year: number | null;
	/** one neighbour list per experiment, already truncated to the display length */
	lists: ComparisonItem[][];
}

export interface ComparisonSpec {
	/** experiment names, in list order — shown as the column headers */
	experiments: string[];
	games: ComparisonGame[];
}

/** FNV-1a — a short stable id for the filename so same-day exports don't collide. */
function fnv(seed: string): number {
	let h = 2166136261;
	for (let i = 0; i < seed.length; i++) {
		h ^= seed.charCodeAt(i);
		h = Math.imul(h, 16777619);
	}
	return h >>> 0;
}

export function comparisonId(spec: ComparisonSpec): string {
	const seed = `${spec.experiments.join('|')}::${spec.games.map((g) => g.id).join(',')}`;
	return fnv(seed).toString(36).padStart(7, '0').slice(0, 7);
}

const COL_ACCENTS = ['#1f6feb', '#b45309', '#1a7f37']; // blue / amber / green — CB-safe
const COL_ACCENTS_DARK = ['#6ea8fe', '#e0a458', '#4ac26b'];

const esc = (s: string) =>
	String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');

export function buildComparisonHtml(spec: ComparisonSpec, now: Date = new Date()): string {
	const n = spec.experiments.length;
	const stamp = now.toISOString().slice(0, 10);

	const rows = [...spec.games]
		.sort((a, b) => a.name.localeCompare(b.name))
		.map((g) => {
			const idSets = g.lists.map((l) => new Set(l.map((i) => i.id)));
			const sig = g.lists.map((l) => l.map((i) => i.id).join(','));
			const changed = new Set(sig).size > 1;
			const cols = g.lists
				.map((l, k) => {
					const items = l
						.map((it) => {
							const uniq = idSets.every((s, j) => j === k || !s.has(it.id));
							const yr = it.year ? ` <span class="gy">(${it.year})</span>` : '';
							const href = `https://boardgamegeek.com/boardgame/${it.id}`;
							return `<li${uniq ? ' class="u"' : ''}><a href="${href}" target="_blank" rel="noopener">${esc(it.name)}</a>${yr}</li>`;
						})
						.join('');
					return `<ol class="lst" style="--a:var(--a${k})">${items}</ol>`;
				})
				.join('');
			const yr = g.year ? ` <span class="yr">${g.year}</span>` : '';
			return `<div class="row${changed ? '' : ' same'}">
      <div class="g"><a href="https://boardgamegeek.com/boardgame/${g.id}" target="_blank" rel="noopener">${esc(g.name)}${yr} ↗</a></div>
      ${cols}
    </div>`;
		})
		.join('\n');

	const headCols = spec.experiments.map((name) => `<b>${esc(name)}</b>`).join('');
	const accentVars = (light: boolean) =>
		(light ? COL_ACCENTS : COL_ACCENTS_DARK).map((c, i) => `--a${i}: ${c};`).join(' ');
	const changedCount = spec.games.filter(
		(g) => new Set(g.lists.map((l) => l.map((i) => i.id).join(','))).size > 1
	).length;

	return `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8" />
<meta name="viewport" content="width=device-width, initial-scale=1" />
<title>Similar-games list comparison</title>
<style>
  :root {
    --bg: #fbfbfa; --fg: #1a1a1a; --muted: #6b6b6b; --line: #e2e2df; --card: #fff;
    --accent: #2f6feb; --same: #f4f4f2; ${accentVars(true)}
  }
  @media (prefers-color-scheme: dark) {
    :root {
      --bg: #17181a; --fg: #ececec; --muted: #9a9a9a; --line: #2e2f32; --card: #1f2023;
      --accent: #6ea8fe; --same: #1e1f22; ${accentVars(false)}
    }
  }
  * { box-sizing: border-box; }
  body { margin: 0; background: var(--bg); color: var(--fg);
    font: 13px/1.45 system-ui, -apple-system, Segoe UI, Roboto, sans-serif; }
  .wrap { max-width: 82rem; margin: 0 auto; padding: 0 1rem 4rem; }
  .bar { position: sticky; top: 0; z-index: 5; background: var(--bg);
    padding: .8rem 0 .5rem; border-bottom: 1px solid var(--line); }
  .bar h1 { font-size: 1rem; margin: 0 0 .2rem; }
  .bar .meta { color: var(--muted); font-size: .8rem; }
  .bar label { display: inline-flex; align-items: center; gap: .35rem; margin-top: .5rem; font-size: .8rem; }
  .cols { display: grid; grid-template-columns: 12rem repeat(${n}, minmax(0, 1fr)); gap: .8rem;
    margin-top: .6rem; padding: 0 .3rem; font-size: .68rem; font-weight: 700;
    text-transform: uppercase; letter-spacing: .05em; color: var(--muted); }
  .cols b { color: var(--fg); }
  .row { display: grid; grid-template-columns: 12rem repeat(${n}, minmax(0, 1fr)); gap: .8rem;
    padding: .55rem .3rem; border-top: 1px solid var(--line); }
  .row.same { opacity: .5; }
  .row .g { min-width: 0; }
  .row .g a { color: var(--accent); text-decoration: none; font-weight: 600; }
  .row .yr { color: var(--muted); font-weight: 400; }
  ol.lst { margin: 0; padding: 0; list-style: none; min-width: 0; counter-reset: r;
    font-variant-numeric: tabular-nums; }
  ol.lst li { white-space: nowrap; overflow: hidden; text-overflow: ellipsis; padding: .04rem 0; }
  ol.lst li::before { counter-increment: r; content: counter(r) ". "; color: var(--muted); }
  ol.lst li a { color: inherit; text-decoration: none; }
  ol.lst li a:hover { text-decoration: underline; }
  ol.lst li.u { color: var(--a); font-weight: 600; }
  ol.lst li.u::before { color: var(--a); }
  ol.lst .gy { color: var(--muted); font-weight: 400; }
  @media (max-width: 60rem) {
    .cols, .row { grid-template-columns: 1fr; }
    .cols { display: none; }
    .row .g { font-weight: 700; margin-bottom: .2rem; }
  }
</style>
</head>
<body>
<div class="wrap">
  <div class="bar">
    <h1>Similar-games list comparison</h1>
    <div class="meta">${spec.experiments.map(esc).join(' &nbsp;·&nbsp; ')} — ${changedCount} of ${spec.games.length} lists differ — generated ${stamp}</div>
    <label><input type="checkbox" id="co" checked /> only games where the lists differ</label>
    <div class="cols"><span></span>${headCols}</div>
  </div>
  <div id="rows">
${rows}
  </div>
</div>
<script>
  (function () {
    var co = document.getElementById('co');
    function apply() {
      document.getElementById('rows').classList.toggle('hide-same', co.checked);
    }
    co.addEventListener('change', apply);
    var s = document.createElement('style');
    s.textContent = '#rows.hide-same .row.same { display: none; }';
    document.head.appendChild(s);
    apply();
  })();
</script>
</body>
</html>`;
}
