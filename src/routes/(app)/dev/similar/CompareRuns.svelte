<script lang="ts">
	/**
	 * Compare two or three experiment runs over the fixed panel. Aggregate strip up top
	 * ("did it move the needle"), then a per-source table you scan: each column is one
	 * experiment's list, entries unique to that column highlighted in its colour. Verdicts
	 * (A / same / B) persist per experiment pair — only shown for a straight two-way.
	 */
	import { loadVerdicts, saveVerdict, type PanelRun, type Verdict } from './experiments';

	let {
		runs,
		nameOf,
		onpick
	}: {
		runs: { name: string; run: PanelRun }[];
		nameOf: (id: number) => string;
		onpick: (id: number) => void;
	} = $props();

	const TOP = 10;
	const ACCENTS = ['var(--chart-1, oklch(0.62 0.19 250))', 'oklch(0.7 0.15 60)', 'oklch(0.68 0.15 150)'];
	const isPair = $derived(runs.length === 2);

	let verdicts = $state<Record<number, Verdict>>({});
	$effect(() => {
		verdicts = runs.length === 2 ? loadVerdicts(runs[0].name, runs[1].name) : {};
	});
	function setVerdict(sid: number, v: Verdict) {
		if (runs.length !== 2) return;
		const next = verdicts[sid] === v ? null : v;
		saveVerdict(runs[0].name, runs[1].name, sid, next);
		verdicts = { ...verdicts, [sid]: next as Verdict };
		if (next == null) delete verdicts[sid];
	}

	const mean = (xs: number[]) => (xs.length ? xs.reduce((a, b) => a + b, 0) / xs.length : 0);

	interface Cell {
		id: number;
		name: string;
		unique: boolean;
	}
	interface Row {
		sid: number;
		name: string;
		cols: Cell[][];
		changed: boolean;
	}

	const sids = $derived(runs.length ? [...runs[0].run.keys()] : []);

	const rows = $derived.by<Row[]>(() => {
		const out: Row[] = [];
		for (const sid of sids) {
			const lists = runs.map((r) => (r.run.get(sid) ?? []).slice(0, TOP));
			const idSets = lists.map((l) => new Set(l.map((i) => i.id)));
			const cols = lists.map((l, k) =>
				l.map((i) => ({
					id: i.id,
					name: i.name,
					unique: idSets.every((s, j) => j === k || !s.has(i.id))
				}))
			);
			const changed = new Set(lists.map((l) => l.map((i) => i.id).join(','))).size > 1;
			out.push({ sid, name: nameOf(sid), cols, changed });
		}
		return out.sort((a, b) => a.name.localeCompare(b.name));
	});

	function agg(run: PanelRun) {
		const perSourceSim: number[] = [];
		const perSourceGeek: number[] = [];
		const distinct = new Set<number>();
		let items = 0;
		let clones = 0;
		let short = 0;
		let total = 0;
		for (const full of run.values()) {
			const list = full.slice(0, TOP);
			total++;
			if (list.length < TOP) short++;
			if (list.length) perSourceSim.push(mean(list.map((i) => i.sim)));
			const rated = list.filter((i) => i.geek != null).map((i) => i.geek as number);
			if (rated.length) perSourceGeek.push(mean(rated));
			for (const i of list) {
				items++;
				distinct.add(i.id);
				if (i.clone) clones++;
			}
		}
		return {
			meanSim: mean(perSourceSim),
			meanGeek: mean(perSourceGeek),
			distinct: distinct.size,
			cloneRate: items ? clones / items : 0,
			shortShare: total ? short / total : 0
		};
	}
	const aggs = $derived(runs.map((r) => agg(r.run)));
	const changedCount = $derived(rows.filter((r) => r.changed).length);
	const tally = $derived({
		a: Object.values(verdicts).filter((v) => v === 'a').length,
		b: Object.values(verdicts).filter((v) => v === 'b').length,
		same: Object.values(verdicts).filter((v) => v === 'same').length
	});

	let changedOnly = $state(true);
	const shown = $derived(changedOnly ? rows.filter((r) => r.changed) : rows);

	const d2 = (n: number) => n.toFixed(2);
	const pct = (n: number) => `${(n * 100).toFixed(1)}%`;
	const gridCols = $derived(
		`10rem repeat(${runs.length}, minmax(0, 1fr))${isPair ? ' 5rem' : ''}`
	);
</script>

<div class="cr">
	<div class="agg">
		<div class="m">
			<span class="ml">mean similarity</span>
			<span class="mv">{aggs.map((a) => d2(a.meanSim)).join('  /  ')}</span>
		</div>
		<div class="m">
			<span class="ml">mean geek rating</span>
			<span class="mv">{aggs.map((a) => d2(a.meanGeek)).join('  /  ')}</span>
		</div>
		<div class="m">
			<span class="ml">distinct games</span>
			<span class="mv">{aggs.map((a) => a.distinct).join('  /  ')}</span>
		</div>
		<div class="m">
			<span class="ml">clone rate</span>
			<span class="mv">{aggs.map((a) => pct(a.cloneRate)).join('  /  ')}</span>
		</div>
		<div class="m">
			<span class="ml">short lists (&lt; {TOP})</span>
			<span class="mv">{aggs.map((a) => pct(a.shortShare)).join('  /  ')}</span>
		</div>
		<div class="m">
			<span class="ml">lists changed</span>
			<span class="mv">{changedCount} of {rows.length}</span>
		</div>
	</div>

	<div class="bar">
		<label class="chk"><input type="checkbox" bind:checked={changedOnly} /> changed only</label>
		{#if isPair}
			<span class="tally">
				<b>{runs[0].name}</b> better {tally.a} · same {tally.same} · <b>{runs[1].name}</b> better {tally.b}
				· unjudged {changedCount - tally.a - tally.b - tally.same}
			</span>
		{:else}
			<span class="tally">{runs.map((r) => r.name).join('  ·  ')}</span>
		{/if}
	</div>

	<div class="tbl">
		<div class="hrow" style="grid-template-columns: {gridCols}">
			<span>source</span>
			{#each runs as r (r.name)}<span>{r.name}</span>{/each}
			{#if isPair}<span>verdict</span>{/if}
		</div>
		{#each shown as r (r.sid)}
			<div class="trow" class:unchanged={!r.changed} style="grid-template-columns: {gridCols}">
				<button class="src" onclick={() => onpick(r.sid)} title="Open in Tune">{r.name}</button>
				{#each r.cols as col, k (k)}
					<ol class="lst" style="--accent: {ACCENTS[k] ?? ACCENTS[0]}">
						{#each col as it (it.id)}<li class:uniq={it.unique}>{it.name}</li>{/each}
					</ol>
				{/each}
				{#if isPair}
					<div class="vd">
						<button class:on={verdicts[r.sid] === 'a'} onclick={() => setVerdict(r.sid, 'a')}>A</button>
						<button class:on={verdicts[r.sid] === 'same'} onclick={() => setVerdict(r.sid, 'same')}>=</button>
						<button class:on={verdicts[r.sid] === 'b'} onclick={() => setVerdict(r.sid, 'b')}>B</button>
					</div>
				{/if}
			</div>
		{:else}
			<p class="empty">No {changedOnly ? 'changed ' : ''}sources.</p>
		{/each}
	</div>
</div>

<style>
	.cr {
		margin-top: var(--space-md);
	}
	.agg {
		display: flex;
		flex-wrap: wrap;
		gap: var(--space-md) var(--space-lg);
		padding: var(--space-md);
		border: 1px solid var(--border);
		border-radius: var(--radius);
		background: var(--card);
	}
	.m {
		display: flex;
		flex-direction: column;
		gap: 0.1rem;
	}
	.ml {
		font-size: 0.66rem;
		text-transform: uppercase;
		letter-spacing: 0.04em;
		color: var(--muted-foreground);
	}
	.mv {
		font-size: 0.9rem;
		font-weight: 650;
		font-variant-numeric: tabular-nums;
	}

	.bar {
		display: flex;
		justify-content: space-between;
		align-items: center;
		gap: 1rem;
		flex-wrap: wrap;
		margin: var(--space-md) 0 0.5rem;
		font-size: 0.78rem;
	}
	.chk {
		display: inline-flex;
		align-items: center;
		gap: 0.35rem;
	}
	.tally {
		color: var(--muted-foreground);
	}
	.tally b {
		color: var(--foreground);
	}

	.tbl {
		border: 1px solid var(--border);
		border-radius: var(--radius);
		overflow: hidden;
	}
	.hrow,
	.trow {
		display: grid;
		gap: var(--space-md);
		padding: 0.5rem 0.6rem;
	}
	.hrow {
		font-size: 0.66rem;
		text-transform: uppercase;
		letter-spacing: 0.04em;
		color: var(--muted-foreground);
		background: var(--muted);
	}
	.trow {
		border-top: 1px solid var(--border);
		font-size: 0.78rem;
	}
	.trow.unchanged {
		opacity: 0.55;
	}
	.src {
		font: inherit;
		text-align: left;
		background: none;
		border: none;
		color: var(--primary);
		cursor: pointer;
		padding: 0;
		font-weight: 600;
		overflow: hidden;
		text-overflow: ellipsis;
	}
	.src:hover {
		text-decoration: underline;
	}
	.lst {
		margin: 0;
		padding: 0;
		list-style: none;
		display: flex;
		flex-direction: column;
		gap: 0.05rem;
		min-width: 0;
	}
	.lst li {
		white-space: nowrap;
		overflow: hidden;
		text-overflow: ellipsis;
		font-variant-numeric: tabular-nums;
	}
	.lst li.uniq {
		color: var(--accent);
		font-weight: 600;
	}
	.vd {
		display: flex;
		gap: 0.2rem;
		align-items: flex-start;
	}
	.vd button {
		font: inherit;
		font-size: 0.72rem;
		width: 1.4rem;
		height: 1.4rem;
		border: 1px solid var(--border);
		border-radius: 4px;
		background: var(--background);
		color: var(--muted-foreground);
		cursor: pointer;
	}
	.vd button.on {
		border-color: var(--primary);
		background: color-mix(in oklch, var(--primary) 15%, transparent);
		color: var(--foreground);
		font-weight: 700;
	}
	.empty {
		padding: var(--space-md);
		color: var(--muted-foreground);
		font-size: 0.8rem;
	}
</style>
