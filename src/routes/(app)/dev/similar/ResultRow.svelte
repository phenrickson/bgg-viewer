<script lang="ts">
	/**
	 * One neighbour in a similar-games list, carrying BOTH badges — Similarity and Rating —
	 * so the two lists can be sifted at a glance while tuning. Clicking the row walks to that
	 * game as the new source; the ⟷ opens a feature comparison against the current source.
	 */
	import { similarityPct, similarityColor, ratingColor } from '$lib/game/similarity';

	interface Row {
		id: number;
		name: string;
		year: number | null;
		sim: number;
		geek: number | null;
		usersRated: number | null;
		complexity: number | null;
		inOther?: boolean;
		rank: number;
	}

	let {
		row,
		shift = null,
		active = false,
		simLabel = 'sim',
		onselect,
		oncompare
	}: {
		row: Row;
		/** positions moved vs the pure-similarity ranking of the same set (+ = up); null = n/a */
		shift?: number | null;
		/** this row is the one currently shown in the compare dock */
		active?: boolean;
		/** label on the first badge — "sim" for neighbour lists, "alone" for the outliers list */
		simLabel?: string;
		onselect: () => void;
		/** omit to hide the compare button (e.g. the outliers list, which has no source game) */
		oncompare?: () => void;
	} = $props();

	const int = (n: number | null | undefined) => (n == null ? '—' : Math.round(n).toLocaleString());
</script>

<div class="row" class:shared={row.inOther} class:active>
	<button class="main" onclick={onselect} title="Set as source game">
		<span class="rk">
			{row.rank}
			{#if shift != null && shift !== 0}
				<span class="shift" class:up={shift > 0} title="{Math.abs(shift)} spot{Math.abs(shift) === 1 ? '' : 's'} {shift > 0 ? 'up' : 'down'} vs pure similarity">
					{shift > 0 ? '▲' : '▼'}{Math.abs(shift)}
				</span>
			{/if}
		</span>
		<span class="body">
			<span class="nm">{row.name} {#if row.year}<span class="yr">{row.year}</span>{/if}</span>
			<span class="meta">
				{int(row.usersRated)} ratings · complexity {row.complexity?.toFixed(1) ?? '—'}
				{#if row.inOther}· <span class="sharedtag">in both</span>{/if}
			</span>
		</span>
		<span class="badges">
			<span class="badge" style:color={similarityColor(row.sim)}>
				<span class="bl">{simLabel}</span>{Math.round(similarityPct(row.sim))}%
			</span>
			<span class="badge" style:color={ratingColor(row.geek)}>
				<span class="bl">rating</span>{row.geek && row.geek > 0 ? row.geek.toFixed(1) : '—'}
			</span>
		</span>
	</button>
	{#if oncompare}
		<button
			class="cmp"
			class:on={active}
			onclick={oncompare}
			title="Compare features with the source game"
		>⟷</button>
	{/if}
</div>

<style>
	.row {
		display: flex;
		align-items: stretch;
		gap: 0.25rem;
		min-width: 0;
		border: 1px solid var(--border);
		border-radius: 8px;
		background: var(--background);
		overflow: hidden;
	}
	.row:hover {
		border-color: var(--primary);
	}
	.shared {
		background: color-mix(in oklch, var(--primary) 5%, var(--background));
	}
	.row.active {
		border-color: var(--primary);
		box-shadow: inset 3px 0 0 var(--primary);
	}
	.main {
		display: flex;
		align-items: center;
		gap: 0.6rem;
		flex: 1;
		min-width: 0;
		padding: 0.4rem 0.5rem;
		border: none;
		background: none;
		text-align: left;
		cursor: pointer;
		font: inherit;
		color: inherit;
	}
	.cmp {
		flex: none;
		width: 2rem;
		border: none;
		border-left: 1px solid var(--border);
		background: none;
		color: var(--muted-foreground);
		cursor: pointer;
		font-size: 0.9rem;
	}
	.cmp:hover {
		background: color-mix(in oklch, var(--primary) 12%, transparent);
		color: var(--primary);
	}
	.cmp.on {
		background: var(--primary);
		color: oklch(0.99 0 0);
	}
	.rk {
		flex: none;
		width: 1.7rem;
		display: flex;
		flex-direction: column;
		align-items: flex-end;
		line-height: 1.1;
		font-size: 0.72rem;
		font-variant-numeric: tabular-nums;
		color: var(--muted-foreground);
	}
	.shift {
		font-size: 0.62rem;
		font-weight: 700;
		color: var(--color-negative);
	}
	.shift.up {
		color: var(--color-positive);
	}
	.body {
		flex: 1;
		min-width: 0;
		display: flex;
		flex-direction: column;
		gap: 0.1rem;
	}
	.nm {
		font-weight: 600;
		font-size: 0.86rem;
		white-space: nowrap;
		overflow: hidden;
		text-overflow: ellipsis;
	}
	.yr {
		color: var(--muted-foreground);
		font-weight: 400;
		font-size: 0.76rem;
	}
	.meta {
		font-size: 0.7rem;
		color: var(--muted-foreground);
		font-variant-numeric: tabular-nums;
	}
	.sharedtag {
		color: var(--primary);
	}
	.badges {
		flex: none;
		display: flex;
		gap: 0.3rem;
	}
	.badge {
		display: inline-flex;
		align-items: baseline;
		gap: 0.25rem;
		font-size: 0.8rem;
		font-weight: 650;
		font-variant-numeric: tabular-nums;
		padding: 0.15rem 0.4rem;
		border-radius: 999px;
		border: 1px solid color-mix(in oklch, currentColor 30%, transparent);
		background: color-mix(in oklch, currentColor 12%, transparent);
	}
	.bl {
		font-size: 0.6rem;
		font-weight: 500;
		text-transform: uppercase;
		letter-spacing: 0.04em;
		opacity: 0.7;
	}
</style>
