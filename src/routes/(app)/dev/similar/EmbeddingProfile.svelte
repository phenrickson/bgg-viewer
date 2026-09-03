<script lang="ts">
	/**
	 * Parallel-coordinates view of the raw embedding — DEV bench only.
	 *
	 * One line per game across the 64 (L2-normalised) components: the source game bold,
	 * its pure-similarity nearest neighbours thin over the top, and a faint catalog
	 * mean ± 1σ ribbon behind them. Lets you see which components a game spikes on and
	 * whether its "neighbours" are neighbours because they spike on the same one — the
	 * tell for a rare feature that's captured a whole SVD dimension.
	 */
	import { LineChart, Spline, Area } from 'layerchart';
	import { curveLinear } from 'd3-shape';

	interface Vec {
		id: number;
		name: string;
		values: Float32Array;
	}

	let {
		dim,
		source,
		neighbors,
		mean,
		std,
		onpick
	}: {
		dim: number;
		source: Vec;
		neighbors: Vec[];
		mean: Float32Array;
		std: Float32Array;
		onpick: (id: number) => void;
	} = $props();

	const data = $derived.by(() => {
		const rows: Record<string, number>[] = [];
		for (let c = 0; c < dim; c++) {
			const row: Record<string, number> = {
				c,
				lo: mean[c] - std[c],
				hi: mean[c] + std[c],
				source: source.values[c]
			};
			neighbors.forEach((n, i) => (row[`n${i}`] = n.values[c]));
			rows.push(row);
		}
		return rows;
	});

	const series = $derived([
		...neighbors.map((n, i) => ({ key: `n${i}`, label: n.name, color: 'var(--muted-foreground)' })),
		{ key: 'source', label: source.name, color: 'var(--primary)' }
	]);
</script>

<div class="ep">
	<div class="chart">
		<LineChart
			{data}
			x="c"
			{series}
			axis="y"
			legend={false}
			highlight={false}
			tooltipContext={false}
		>
			{#snippet marks()}
				<Area
					{data}
					x="c"
					y0="lo"
					y1="hi"
					fill="var(--muted-foreground)"
					fillOpacity={0.12}
					stroke="none"
				/>
				{#each neighbors as _n, i (i)}
					<Spline
						seriesKey={`n${i}`}
						curve={curveLinear}
						stroke="var(--muted-foreground)"
						stroke-width={1}
						opacity={0.55}
					/>
				{/each}
				<Spline seriesKey="source" curve={curveLinear} stroke="var(--primary)" stroke-width={2.5} />
			{/snippet}
		</LineChart>
	</div>

	<div class="legend">
		<span class="src">{source.name}</span>
		{#each neighbors as n (n.id)}
			<button onclick={() => onpick(n.id)}>{n.name}</button>
		{/each}
	</div>
</div>

<style>
	.ep {
		min-width: 0;
		border: 1px solid var(--border);
		border-radius: var(--radius);
		padding: var(--space-md);
		margin-top: var(--space-lg);
	}
	.chart {
		height: 200px;
		min-width: 0;
	}
	.legend {
		display: flex;
		flex-wrap: wrap;
		gap: 0.3rem 0.6rem;
		margin-top: 0.5rem;
		font-size: 0.72rem;
	}
	.legend .src {
		font-weight: 700;
		color: var(--primary);
	}
	.legend button {
		font: inherit;
		font-size: 0.72rem;
		background: none;
		border: none;
		padding: 0;
		color: var(--muted-foreground);
		cursor: pointer;
	}
	.legend button:hover {
		color: var(--foreground);
		text-decoration: underline;
	}
</style>
