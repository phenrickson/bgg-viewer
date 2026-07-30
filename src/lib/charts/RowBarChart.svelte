<script lang="ts">
  import { Chart, Svg, Axis, Bars, Highlight, Tooltip } from 'layerchart';
  import { scaleBand } from 'd3-scale';

  const kfmt = (v: number) => {
    const n = Number(v);
    if (Math.abs(n) >= 1000) return (n / 1000).toFixed(n % 1000 === 0 ? 0 : 1).replace(/\.0$/, '') + 'k';
    return String(n);
  };

  let {
    data,
    label,
    value,
    color = 'var(--chart-3)',
    labelWidth = 116,
    unit = 'games'
  }: {
    data: any[];
    label: string; // categorical key (y, band)
    value: string; // numeric key (x, linear)
    color?: string;
    labelWidth?: number;
    unit?: string;
  } = $props();
</script>

<div class="lc" style="height: {Math.max(data.length, 1) * 1.6 + 1.8}rem">
  <Chart
    {data}
    x={value}
    y={label}
    yScale={scaleBand().padding(0.24)}
    xDomain={[0, null]}
    xNice
    padding={{ left: labelWidth, bottom: 24, top: 4, right: 40 }}
    tooltipContext={{ mode: 'band' }}
  >
    <Svg>
      <Axis placement="bottom" grid rule ticks={4} format={kfmt} />
      <Axis placement="left" rule={false} />
      <Bars radius={2} strokeWidth={0} fill={color} />
      <Highlight area />
    </Svg>

    <Tooltip.Root>
      {#snippet children({ data }: { data: Record<string, unknown> })}
        <Tooltip.Header>{String(data[label])}</Tooltip.Header>
        <Tooltip.List>
          <Tooltip.Item label={unit} value={Number(data[value]).toLocaleString()} />
        </Tooltip.List>
      {/snippet}
    </Tooltip.Root>
  </Chart>
</div>

<style>
  .lc {
    width: 100%;
    color: var(--muted-foreground);
    font-size: 0.75rem;
  }
  .lc :global(.tick text) { font-size: 0.75rem; }
  .lc :global(.tick text) {
    fill: var(--foreground);
  }
  .lc :global([class*='grid'] line) {
    stroke: var(--border);
  }
  .lc :global(.rule) {
    stroke: var(--border);
  }
</style>
