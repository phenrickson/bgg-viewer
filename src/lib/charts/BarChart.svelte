<script lang="ts">
  import { Chart, Svg, Axis, Bars, Highlight, Tooltip } from 'layerchart';
  import { scaleBand } from 'd3-scale';

  // Compact count formatter — 4200 → "4.2k", 4000 → "4k" — so the y-axis stays legible.
  const kfmt = (v: number) => {
    const n = Number(v);
    if (Math.abs(n) >= 1000) return (n / 1000).toFixed(n % 1000 === 0 ? 0 : 1).replace(/\.0$/, '') + 'k';
    return String(n);
  };

  let {
    data,
    x,
    y,
    color = 'var(--chart-1)',
    xFormat = (v: unknown) => String(v),
    yFormat = kfmt,
    xTip = (v: unknown) => String(v),
    unit = 'games',
    tickCount = 4,
    maxXTicks = 60
  }: {
    data: any[];
    x: string;
    y: string;
    color?: string;
    xFormat?: (v: any) => string;
    yFormat?: (v: number) => string;
    xTip?: (v: any) => string; // tooltip formatter — always shows the real value
    unit?: string; // what the y count measures, e.g. "games"
    tickCount?: number;
    maxXTicks?: number; // subsample band ticks past this many bars (e.g. games-per-year)
  } = $props();

  // Too many bands (127 years) crams the axis — show ~8 evenly-spaced ticks instead.
  const bottomTicks = $derived.by(() => {
    if (!data || data.length <= maxXTicks) return undefined;
    const step = Math.ceil(data.length / 8);
    return data.filter((_, i) => i % step === 0).map((d) => d[x]);
  });
</script>

<div class="lc">
  <Chart
    {data}
    {x}
    {y}
    xScale={scaleBand().padding(0.2)}
    yDomain={[0, null]}
    yNice
    padding={{ left: 40, bottom: 26, top: 6, right: 6 }}
    tooltipContext={{ mode: 'band' }}
  >
    <Svg>
      <Axis placement="left" grid rule ticks={tickCount} format={yFormat} />
      <Axis placement="bottom" rule ticks={bottomTicks} format={xFormat} />
      <Bars radius={2} strokeWidth={0} fill={color} />
      <Highlight area />
    </Svg>

    <Tooltip.Root>
      {#snippet children({ data }: { data: Record<string, unknown> })}
        <Tooltip.Header>{xTip(data[x])}</Tooltip.Header>
        <Tooltip.List>
          <Tooltip.Item label={unit} value={yFormat(Number(data[y]))} />
        </Tooltip.List>
      {/snippet}
    </Tooltip.Root>
  </Chart>
</div>

<style>
  .lc {
    height: 100%;
    color: var(--muted-foreground);
    font-size: 0.75rem;
  }
  .lc :global(.tick text) { font-size: 0.75rem; }
  .lc :global(.tick text) {
    fill: var(--muted-foreground);
  }
  .lc :global(.grid .tick line),
  .lc :global([class*='grid'] line) {
    stroke: var(--border);
  }
  .lc :global(.rule) {
    stroke: var(--border);
  }
</style>
