<script lang="ts">
  import { Chart, Svg, Axis, Bars } from 'layerchart';
  import { scaleBand } from 'd3-scale';

  let {
    data,
    x,
    y,
    color = 'var(--chart-1)',
    xFormat,
    yFormat = (v: number) => v.toLocaleString(),
    tickCount = 6
  }: {
    data: any[];
    x: string;
    y: string;
    color?: string;
    xFormat?: (v: any) => string;
    yFormat?: (v: number) => string;
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
  >
    <Svg>
      <Axis placement="left" grid rule ticks={tickCount} format={yFormat} />
      <Axis placement="bottom" rule format={xFormat} />
      <Bars radius={2} strokeWidth={0} fill={color} />
    </Svg>
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
