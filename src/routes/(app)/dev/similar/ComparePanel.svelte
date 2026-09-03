<script lang="ts">
	/**
	 * Feature-level comparison of two games — the source and one picked neighbour. Pops up
	 * above the result lists; ✕ or Escape closes it.
	 *
	 * Shared traits are solid green and listed first in both columns so they align; each
	 * game's own traits follow, muted, capped with a "+N more". Stat values go green when the
	 * two games are close on that axis. `year_published` isn't an embedding input, so it's in
	 * the context line.
	 */
	import { similarityPct } from '$lib/game/similarity';

	interface GMeta {
		id: number;
		name: string;
		year: number | null;
		geek: number | null;
		weight: number | null;
		complexity: number;
		usersRated: number;
		minPlayers: number | null;
		maxPlayers: number | null;
		minPlaytime: number | null;
		maxPlaytime: number | null;
		mechanics: string[];
		categories: string[];
		families: string[];
		designers: string[];
	}

	let {
		a,
		b,
		sim,
		thumbA = null,
		thumbB = null,
		onclose,
		onsetsource
	}: {
		a: GMeta;
		b: GMeta;
		sim: number;
		thumbA?: string | null;
		thumbB?: string | null;
		onclose: () => void;
		onsetsource: () => void;
	} = $props();

	const CAP = 12;

	/** shared-first ordering per column. */
	function ordered(mine: string[], theirs: string[]) {
		const t = new Set(theirs);
		return [
			...mine.filter((v) => t.has(v)).map((v) => ({ v, shared: true })),
			...mine.filter((v) => !t.has(v)).map((v) => ({ v, shared: false }))
		];
	}
	const sharedCount = (x: string[], y: string[]) => {
		const t = new Set(y);
		return x.filter((v) => t.has(v)).length;
	};

	const groups = $derived(
		[
			{ label: 'Mechanics', a: a.mechanics, b: b.mechanics },
			{ label: 'Categories', a: a.categories, b: b.categories },
			{ label: 'Families', a: a.families, b: b.families }
		].map((g) => ({
			label: g.label,
			shared: sharedCount(g.a, g.b),
			aItems: ordered(g.a, g.b),
			bItems: ordered(g.b, g.a)
		}))
	);

	// per-group expand state
	let expanded = $state<Record<string, boolean>>({});

	const rng = (lo: number | null, hi: number | null, unit = '') =>
		lo == null && hi == null ? '—' : lo === hi || hi == null ? `${lo}${unit}` : `${lo}–${hi}${unit}`;

	function overlapFrac(a1: number, a2: number, b1: number, b2: number) {
		const inter = Math.max(0, Math.min(a2, b2) - Math.max(a1, b1));
		const uni = Math.max(a2, b2) - Math.min(a1, b1);
		return uni > 0 ? inter / uni : 1;
	}

	const stats = $derived([
		{
			label: 'Complexity',
			av: a.complexity.toFixed(1),
			bv: b.complexity.toFixed(1),
			match: Math.abs(a.complexity - b.complexity) <= 0.5
		},
		{
			label: 'Players',
			av: rng(a.minPlayers, a.maxPlayers),
			bv: rng(b.minPlayers, b.maxPlayers),
			match:
				a.minPlayers != null &&
				b.minPlayers != null &&
				overlapFrac(
					a.minPlayers,
					a.maxPlayers ?? a.minPlayers,
					b.minPlayers,
					b.maxPlayers ?? b.minPlayers
				) >= 0.5
		},
		{
			label: 'Playtime',
			av: rng(a.minPlaytime, a.maxPlaytime, 'm'),
			bv: rng(b.minPlaytime, b.maxPlaytime, 'm'),
			match:
				a.minPlaytime != null &&
				b.minPlaytime != null &&
				overlapFrac(
					a.minPlaytime,
					a.maxPlaytime ?? a.minPlaytime,
					b.minPlaytime,
					b.maxPlaytime ?? b.minPlaytime
				) >= 0.4
		}
	]);
</script>

<div class="cmp">
	<button class="x" onclick={onclose} aria-label="Close comparison">✕</button>

	<div class="head">
		<div class="game">
			{#if thumbA}<img class="th" src={thumbA} alt="" />{:else}<span class="th ph">{a.name[0]}</span>{/if}
			<div><span class="role">Source</span><span class="nm">{a.name} <span class="yr">{a.year ?? ''}</span></span></div>
		</div>
		<span class="sim">{similarityPct(sim).toFixed(1)}% similar</span>
		<div class="game end">
			<div><span class="role">Neighbour</span><span class="nm">{b.name} <span class="yr">{b.year ?? ''}</span></span></div>
			{#if thumbB}<img class="th" src={thumbB} alt="" />{:else}<span class="th ph">{b.name[0]}</span>{/if}
			<button class="setsrc" onclick={onsetsource} title="Make this the source">↑ source</button>
		</div>
	</div>

	<table class="stats">
		<tbody>
			<tr class="sh"><td></td><td>{a.name}</td><td>{b.name}</td></tr>
			{#each stats as s (s.label)}
				<tr>
					<td class="l">{s.label}</td>
					<td class:g={s.match}>{s.av}</td>
					<td class:g={s.match}>{s.bv}</td>
				</tr>
			{/each}
		</tbody>
	</table>

	{#each groups as grp (grp.label)}
		<div class="grp">
			<p class="gl">
				{grp.label}<span class="badge" class:zero={!grp.shared}>{grp.shared} shared</span>
			</p>
			<div class="two">
				{#each [{ items: grp.aItems, who: 'a' }, { items: grp.bItems, who: 'b' }] as col (col.who)}
					{@const key = grp.label + col.who}
					{@const show = expanded[key] ? col.items : col.items.slice(0, CAP)}
					<div class="col">
						{#each show as it (it.v)}<span class="chip" class:on={it.shared}>{it.v}</span>{/each}
						{#if col.items.length > CAP}
							<button class="more" onclick={() => (expanded[key] = !expanded[key])}>
								{expanded[key] ? 'less' : `+${col.items.length - CAP} more`}
							</button>
						{/if}
						{#if !col.items.length}<span class="none">—</span>{/if}
					</div>
				{/each}
			</div>
		</div>
	{/each}

	<p class="ctx">
		not embedded · weight {a.weight?.toFixed(1) ?? '—'} / {b.weight?.toFixed(1) ?? '—'} · geek
		{a.geek?.toFixed(1) ?? '—'} / {b.geek?.toFixed(1) ?? '—'} · {a.usersRated.toLocaleString()} / {b.usersRated.toLocaleString()}
		ratings
	</p>
</div>

<style>
	.cmp {
		position: relative;
		font-size: 0.85rem;
		border: 1px solid var(--border);
		border-radius: var(--radius);
		background: var(--card);
		padding: var(--space-lg);
		margin-bottom: var(--space-lg);
	}
	.x {
		position: absolute;
		top: 0.7rem;
		right: 0.7rem;
		font: inherit;
		border: 1px solid var(--border);
		border-radius: 6px;
		background: var(--background);
		color: var(--muted-foreground);
		width: 1.7rem;
		height: 1.7rem;
		cursor: pointer;
	}

	.head {
		display: grid;
		grid-template-columns: 1fr auto 1fr;
		align-items: center;
		gap: var(--space-md);
		padding-bottom: var(--space-md);
		border-bottom: 1px solid var(--border);
	}
	.game {
		display: flex;
		align-items: center;
		gap: 0.6rem;
		min-width: 0;
	}
	.game.end {
		justify-content: flex-end;
		text-align: right;
	}
	.th {
		width: 2.6rem;
		height: 2.6rem;
		border-radius: 6px;
		object-fit: cover;
		background: var(--muted);
		flex: none;
	}
	.th.ph {
		display: grid;
		place-items: center;
		font-weight: 700;
		color: var(--muted-foreground);
	}
	.role {
		display: block;
		font-size: 0.6rem;
		text-transform: uppercase;
		letter-spacing: 0.06em;
		color: var(--muted-foreground);
	}
	.nm {
		font-weight: 700;
		font-size: 1rem;
	}
	.yr {
		color: var(--muted-foreground);
		font-weight: 400;
		font-size: 0.85rem;
	}
	.sim {
		background: var(--primary);
		color: oklch(0.99 0 0);
		font-size: 0.8rem;
		font-weight: 650;
		padding: 0.2rem 0.7rem;
		border-radius: 999px;
		white-space: nowrap;
	}
	.setsrc {
		flex: none;
		font: inherit;
		font-size: 0.68rem;
		padding: 0.15rem 0.45rem;
		border: 1px solid var(--primary);
		border-radius: 999px;
		background: color-mix(in oklch, var(--primary) 10%, transparent);
		color: var(--primary);
		cursor: pointer;
	}

	.stats {
		border-collapse: collapse;
		margin: var(--space-md) 0 0;
		font-variant-numeric: tabular-nums;
	}
	.stats td {
		padding: 0.35rem 1.5rem 0.35rem 0;
		border-top: 1px solid var(--border);
		font-size: 0.95rem;
		font-weight: 650;
	}
	.stats tr.sh td {
		border-top: none;
		padding-bottom: 0.15rem;
		font-size: 0.68rem;
		font-weight: 700;
		text-transform: uppercase;
		letter-spacing: 0.04em;
		color: var(--muted-foreground);
	}
	.stats td.l {
		font-weight: 400;
		font-size: 0.82rem;
		color: var(--muted-foreground);
		padding-right: 2rem;
	}
	.stats td.g {
		color: var(--color-positive);
	}

	.grp {
		margin-top: var(--space-md);
	}
	.gl {
		display: flex;
		align-items: center;
		gap: 0.4rem;
		font-size: 0.76rem;
		font-weight: 650;
		margin: 0 0 0.4rem;
	}
	.badge {
		font-size: 0.62rem;
		font-weight: 600;
		padding: 0.05rem 0.4rem;
		border-radius: 999px;
		color: var(--color-positive);
		background: color-mix(in oklch, var(--color-positive) 16%, transparent);
	}
	.badge.zero {
		color: var(--muted-foreground);
		background: color-mix(in oklch, var(--muted-foreground) 14%, transparent);
	}
	.two {
		display: grid;
		grid-template-columns: 1fr 1fr;
		gap: var(--space-md);
	}
	.col {
		display: flex;
		flex-wrap: wrap;
		gap: 0.3rem;
		align-content: flex-start;
	}
	.chip {
		font-size: 0.73rem;
		padding: 0.12rem 0.5rem;
		border-radius: 999px;
		border: 1px solid var(--border);
		background: color-mix(in oklch, var(--muted) 45%, transparent);
		color: var(--muted-foreground);
	}
	.chip.on {
		border-color: transparent;
		background: var(--color-positive);
		color: oklch(0.99 0 0);
		font-weight: 600;
	}
	.more {
		font: inherit;
		font-size: 0.68rem;
		color: var(--primary);
		background: none;
		border: none;
		cursor: pointer;
		padding: 0.12rem 0.3rem;
	}
	.more:hover {
		text-decoration: underline;
	}
	.none {
		color: var(--muted-foreground);
		opacity: 0.5;
	}
	.ctx {
		font-size: 0.7rem;
		color: var(--muted-foreground);
		margin: var(--space-lg) 0 0;
		font-variant-numeric: tabular-nums;
	}
</style>
