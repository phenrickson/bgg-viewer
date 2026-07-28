<script lang="ts">
  import { Chart, Svg, Axis, Points } from 'layerchart';
  import { scaleLinear } from 'd3-scale';

  type Datum = { x: number; y: number; name?: string };
  let {
    data,
    xDomain,
    yDomain,
    xLabel = '',
    yLabel = '',
    color = 'var(--chart-1)'
  }: {
    data: Datum[];
    xDomain?: [number, number];
    yDomain?: [number, number];
    xLabel?: string;
    yLabel?: string;
    color?: string;
  } = $props();
</script>

<div class="lc">
  <Chart
    {data}
    x="x"
    y="y"
    xScale={scaleLinear()}
    yScale={scaleLinear()}
    xDomain={xDomain ?? [0, null]}
    yDomain={yDomain ?? [0, null]}
    xNice
    yNice
    padding={{ left: 40, bottom: 34, top: 6, right: 8 }}
  >
    <Svg>
      <Axis placement="left" grid rule ticks={6} label={yLabel} />
      <Axis placement="bottom" grid rule ticks={6} label={xLabel} />
      <Points r={2} fill={color} fillOpacity={0.4} strokeWidth={0} />
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
  .lc :global([class*='grid'] line) {
    stroke: var(--border);
    stroke-opacity: 0.6;
  }
  .lc :global(.rule) {
    stroke: var(--border);
  }
  .lc :global(.axis .label) {
    fill: var(--muted-foreground);
  }
</style>
