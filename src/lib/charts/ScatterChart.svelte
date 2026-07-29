<script lang="ts">
  import { Chart, Svg, Canvas, Axis, Points, Highlight, Tooltip } from 'layerchart';
  import { scaleLinear, scaleLog } from 'd3-scale';

  type Datum = { x: number; y: number; game_id?: number };
  let {
    data,
    xDomain,
    yDomain,
    xLabel = '',
    yLabel = '',
    color = 'var(--chart-1)',
    yLog = false,
    xFmt = (v: number) => v.toFixed(2),
    yFmt = (v: number) => v.toLocaleString(),
    nameOf,
    r = 1.8,
    opacity = 0.35
  }: {
    data: Datum[];
    xDomain?: [number, number];
    yDomain?: [number, number | null];
    xLabel?: string;
    yLabel?: string;
    color?: string;
    yLog?: boolean;
    xFmt?: (v: number) => string;
    yFmt?: (v: number) => string;
    /** Resolve a point's game name from its id — the plot data carries no name string. */
    nameOf?: (id: number) => string | undefined;
    r?: number;
    opacity?: number;
  } = $props();
</script>

<div class="lc">
  <Chart
    {data}
    x="x"
    y="y"
    xScale={scaleLinear()}
    yScale={(yLog ? scaleLog() : scaleLinear()) as never}
    xDomain={xDomain ?? [0, null]}
    yDomain={yDomain ?? (yLog ? [1, null] : [0, null])}
    xNice
    yNice={!yLog}
    padding={{ left: 44, bottom: 34, top: 6, right: 8 }}
    tooltipContext={{ mode: 'quadtree' }}
  >
    <!-- Dense point cloud is painted on a Canvas layer — tens of thousands of marks
         stay smooth because they're pixels, not DOM nodes. Axes + the single hovered
         highlight stay on crisp SVG on top. -->
    <Canvas>
      <Points {r} fill={color} fillOpacity={opacity} />
    </Canvas>
    <Svg>
      <Axis placement="left" grid rule ticks={6} label={yLabel} format={yFmt} />
      <Axis placement="bottom" grid rule ticks={6} label={xLabel} format={xFmt} />
      <Highlight points={{ r: 3.5, fill: color }} />
    </Svg>

    <Tooltip.Root>
      {#snippet children({ data }: { data: Datum })}
        {@const nm = data.game_id != null ? nameOf?.(data.game_id) : undefined}
        {#if nm}<Tooltip.Header>{nm}</Tooltip.Header>{/if}
        <Tooltip.List>
          <Tooltip.Item label={xLabel || 'x'} value={xFmt(data.x)} />
          <Tooltip.Item label={yLabel || 'y'} value={yFmt(data.y)} />
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
