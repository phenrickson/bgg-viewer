<script lang="ts">
  import { Chart, Svg, Axis, Bars, Highlight, Tooltip } from 'layerchart';
  import { scaleBand } from 'd3-scale';

  let {
    data,
    x,
    y,
    color = 'var(--chart-1)',
    xFormat,
    yFormat = (v: number) => v.toLocaleString(),
    xTip = (v: unknown) => String(v),
    unit = 'games',
    tickCount = 6
  }: {
    data: any[];
    x: string;
    y: string;
    color?: string;
    xFormat?: (v: any) => string; // axis-tick formatter (may blank labels to de-clutter)
    yFormat?: (v: number) => string;
    xTip?: (v: any) => string; // tooltip formatter — always shows the real value
    unit?: string; // what the y count measures, e.g. "games"
    tickCount?: number;
  } = $props();
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
      <Axis placement="bottom" rule format={xFormat} />
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
    font-size: 0.7rem;
  }
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
