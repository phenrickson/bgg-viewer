---
name: frontend-patterns
description: "Use when building, modifying, or reviewing frontend pages, components, layouts, tables, charts, or client-side data fetching. Covers layout system, fluid typography, data tables, charts, page structure, TanStack Query pattern, Sheets for secondary CRUD, component organization, and Svelte 5 patterns."
---

# Front-End Patterns

Conventions and patterns for building your app's UI. Follow these when creating or modifying pages, components, tables, charts, and layouts.

## Layout System

The layout model is **width drives arrangement, content drives height**. Cards reflow by available width; height comes from content within bounded ranges. Use `rem` and container units — never `svh`/`vh` or fixed `h-[Npx]` heights on content.

### Primitives (`$lib/components/ui/layout`)

Three primitives compose every page: `Stack`, `AutoGrid`, `Split`.

```svelte
<script lang="ts">
  import { Stack, AutoGrid, Split } from "$lib/components/ui/layout";
</script>
```

**`Stack`** — vertical rhythm (flex column + gap). Props: `gap` (`"sm"` | `"md"` | `"lg"`, default `"md"`).

```svelte
<Stack gap="lg">
  <SectionA />
  <SectionB />
</Stack>
```

**`AutoGrid`** — reflowing row of equal cards via CSS `repeat(auto-fit, minmax(min(100%, var(--col-min)), 1fr))`. Cards reflow N→1 by available width with no breakpoints and never overflow horizontally; rows equalize card height via `align-items: stretch`. Props: `min` (`"sm"` | `"md"` | `"lg"` | `"xl"`, default `"md"`) = the comfortable column width; `gap`.

```svelte
<!-- KPI strip / chart row — cards reflow by width -->
<AutoGrid min="md">
  <Card.Kpi ... />
  <Card.Kpi ... />
  <Card.Kpi ... />
</AutoGrid>
```

A child with the attribute `data-full` spans the full row (`grid-column: 1 / -1`). This is the **only** supported span — arbitrary `span N` is intentionally unsupported because it overflows when the container is narrow.

```svelte
<AutoGrid min="lg">
  <ChartCard />
  <ChartCard />
  <TableCard data-full />  <!-- spans the whole row -->
</AutoGrid>
```

**`Split`** — an intentional main + aside region that stacks to one column based on **its own width** (a container query, not the viewport). Snippet props `aside` and `main`. Props: `ratio` (`"half"` | `"aside-narrow"` | `"aside-wide"`, default `"aside-narrow"`), `side` (`"start"` | `"end"`), `at` (`"sm"` | `"md"`, default `"md"`). Use it for record-detail headers (info card + KPI stack) and featured-vs-supporting regions.

```svelte
<Split ratio="aside-narrow">
  {#snippet main()}<InfoCard />{/snippet}
  {#snippet aside()}<KpiStack />{/snippet}
</Split>
```

### Page shell & the two archetypes

The `(app)` layout wraps every page in one padded, gap-spaced flex-column scroll container with `container-type: inline-size`. **There is no per-page mode flag.** Two archetypes emerge from how a page fills that shell:

**1. Content-driven (default).** Dashboards, forms, detail pages. Emit a sequence of `AutoGrid` / `Split` / `Stack` regions; they take their natural height and the page scrolls vertically. This is most pages — no special wrapper needed.

```svelte
<Stack gap="lg">
  <AutoGrid min="md"><Kpi /><Kpi /><Kpi /></AutoGrid>
  <AutoGrid min="lg"><ChartCard /><ChartCard /></AutoGrid>
  <TableCard />
</Stack>
```

**2. Fill-height (Pattern A).** Primary full-page tables, master-detail panes, interactive canvases. Make the page root `flex min-h-0 flex-1 flex-col` so it fills the wrapper's definite height (which flows from the shell's `h-svh` — there are **no viewport units in your page code**). Keep toolbars / KPIs / headers at natural height, and put the table or pane in a `flex-1 min-h-0` region so its internal `DataTable` / `ScrollArea` (`overflow-auto flex-1 min-h-0`) scrolls the body with the header pinned.

```svelte
<div class="flex min-h-0 flex-1 flex-col gap-4">
  <Toolbar />                          <!-- natural height -->
  <div class="min-h-0 flex-1">         <!-- fills remaining height -->
    <DataTable {table} />              <!-- scrolls internally -->
  </div>
</div>
```

Reference: a primary full-page table route.

### Cards

- **KPI cards** (`Card.Kpi`): pass `centered` to vertically center the content (`card-stat.svelte` implements it). The value font scales with the item width via the `@container` + `text-[clamp(...cqi...)]` rule on `card-stat-item.svelte`.
- **Chart cards**: use the `.chart-area` utility (defined in `app.css`) — it owns **all** chart sizing. The card is `Card.Root class="flex flex-col min-w-0"` with **no** `self-start`, **no** `aspect-[...]`, **no** `h-full` or fixed height. The chart wrapper element gets `class="chart-area"`. If that wrapper is a child div inside `Card.Content`, make `Card.Content` = `flex flex-1 flex-col min-h-0`; the chart inside stays `h-full`. `.chart-area` is a definite `height: var(--chart-h)` (24rem) + `display: flex; flex-direction: column` (so `h-full`/`flex-1` children resolve against it) + `overflow: hidden`. Every chart card uses this one height — there is no "featured"/wide tier. Effect: chart cards in a row are equal by construction, and tall content (long leaderboards) scrolls inside its own `ScrollArea`. Reference: a dashboard chart widget.

```svelte
<Card.Root class="flex flex-col min-w-0">
  <Card.Header><Card.Title>Margin by region</Card.Title></Card.Header>
  <Card.Content class="flex flex-1 flex-col min-h-0">
    <div class="chart-area">
      <Chart ... class="h-full">...</Chart>
    </div>
  </Card.Content>
</Card.Root>
```

- **Embedded dashboard tables** (a table sitting as one card among others on a dashboard): bound it with `class="flex max-h-[40rem] min-h-0 flex-col"` so it scrolls inside its card and the page never scrolls horizontally. This `max-h-[40rem]` cap is **only** for embedded dashboard tables — never for primary full-page tables (those use fill-height Pattern A above).

### Tokens (in `app.css`)

- Spacing: `--space-sm` / `--space-md` / `--space-lg` / `--space-xl` (used by `Stack`/`AutoGrid`/`Split` gaps).
- Fluid type: `--text-display`, `--text-heading` — width-based `clamp`, applied to `h1`/`h2`.
- Chart height: `--chart-h` (24rem) — the single definite height applied by `.chart-area` to every chart card.

The main content area has `@container/main` set via the app layout, and cards have `container-type: inline-size`. Use container query units (`cqi`) for fluid sizing inside cards. Vertical scroll only — never horizontal.

## Fluid Typography

Card sub-components use `cqi`-based `clamp()` for text that scales with the card's width. These are set via `<style>` blocks in the card components — do NOT add hardcoded `text-sm`, `text-lg`, etc. that would override them.

| Component | Clamp | Notes |
|-----------|-------|-------|
| `Card.Title` | `clamp(14px, 6cqi, 22px)` | Titles scale 14–22px |
| `Card.Description` | `clamp(12px, 5cqi, 16px)` | Subtitles/labels |
| `Card.Content` | `clamp(13px, 5cqi, 18px)` | Body text inherits this |
| `KpiCard` value | `clamp(24px, 8cqi, 36px)` | Large hero numbers |
| `StatCard` value | `clamp(18px, 6cqi, 30px)` | Stat numbers |
| `StatItem` label | `clamp(10px, 3cqi, 13px)` | Small stat labels |
| `StatItem` value | `clamp(16px, 6cqi, 28px)` | Stat item values |

**Key rule:** 1cqi = 1% of the container's inline size. For a 350px card, `6cqi` = 21px. Use multipliers of 4–8x for readable results.

**Anti-pattern:** Do not add `text-sm` or `text-base` classes to content inside cards — it overrides the fluid sizing. If you need to override, use a `<style>` block with `clamp()`.

## Page Structure — Unified Header

Pages do NOT render their own headers. The app layout (`(app)/+layout.svelte`) renders breadcrumbs and subtitles from server load data:

```typescript
// +page.server.ts
export const load: PageServerLoad = async () => {
  return {
    breadcrumbs: [
      { label: "Admin", href: "/admin" },
      { label: "Access" },
    ],
    subtitle: "Manage employees, roles, and permissions.",
  };
};
```

For page-specific actions in the header (filters, buttons), use the `header_actions` context:

```svelte
<script lang="ts">
  import { getContext } from "svelte";
  import type { Writable } from "svelte/store";
  import type { Snippet } from "svelte";

  const headerActions = getContext<Writable<Snippet | null>>("header_actions");

  $effect(() => {
    headerActions.set(myActions);
    return () => headerActions.set(null);
  });
</script>

{#snippet myActions()}
  <Button size="sm">Create</Button>
{/snippet}
```

## Data Tables (TanStack Table)

All data tables use `@tanstack/table-core` with the shadcn-svelte `createSvelteTable` wrapper. Two patterns exist — use the correct one for the context.

### Pattern A: Full-page / directory-style

Used for primary data pages where the table fills the page. No pagination — uses `ScrollArea` with a sticky header. Supports column-level filters, faceted filters, and state snapshots.

```typescript
import {
  getCoreRowModel, getFilteredRowModel, getSortedRowModel,
  getFacetedRowModel, getFacetedUniqueValues,
} from "@tanstack/table-core";
import type { ColumnDef, ColumnFiltersState, SortingState, VisibilityState } from "@tanstack/table-core";
import type { Snapshot } from "@sveltejs/kit";

let sorting = $state<SortingState>([]);
let columnFilters = $state<ColumnFiltersState>([]);
let columnVisibility = $state<VisibilityState>({});

const table = createSvelteTable({
  get data() { return items; },
  columns,
  getCoreRowModel: getCoreRowModel(),
  getFilteredRowModel: getFilteredRowModel(),
  getSortedRowModel: getSortedRowModel(),
  getFacetedRowModel: getFacetedRowModel(),
  getFacetedUniqueValues: getFacetedUniqueValues(),
  state: {
    get sorting() { return sorting; },
    get columnFilters() { return columnFilters; },
    get columnVisibility() { return columnVisibility; },
  },
  onSortingChange: (u) => { sorting = typeof u === "function" ? u(sorting) : u; },
  onColumnFiltersChange: (u) => { columnFilters = typeof u === "function" ? u(columnFilters) : u; },
  onColumnVisibilityChange: (u) => { columnVisibility = typeof u === "function" ? u(columnVisibility) : u; },
});

// Derived helpers
const nameFilter = $derived((table.getColumn("name")?.getFilterValue() as string) ?? "");
const isFiltered = $derived(table.getState().columnFilters.length > 0);

// Persist filter/sort state across navigation
export const snapshot: Snapshot<{ sorting: SortingState; columnFilters: ColumnFiltersState; columnVisibility: VisibilityState }> = {
  capture: () => ({ sorting, columnFilters, columnVisibility }),
  restore: (v) => { sorting = v.sorting; columnFilters = v.columnFilters; columnVisibility = v.columnVisibility; },
};
```

**Column definition:**
```typescript
const columns: ColumnDef<Item>[] = [
  {
    accessorKey: "name",
    header: ({ column }) => renderComponent(DataTableColumnHeader, { column, title: "Name" }),
    cell: ({ row }) => row.getValue("name"),
    filterFn: (row, id, value) => value.includes(row.getValue(id)), // for faceted filters
  },
  {
    id: "location",
    accessorFn: (row) => [row.city, row.state].filter(Boolean).join(", ") || null,
    cell: ({ getValue }) => getValue() ?? "—",
  },
];
```

**Toolbar with search and faceted filters:**
```svelte
<div class="flex items-center gap-2">
  <Input
    placeholder="Search..."
    class="h-8 max-w-sm"
    value={nameFilter}
    oninput={(e) => table.getColumn("name")?.setFilterValue(e.currentTarget.value)}
  />
  {#if table.getColumn("status")}
    <DataTableFacetedFilter column={table.getColumn("status")!} title="Status" options={statusOptions} />
  {/if}
  {#if isFiltered}
    <Button variant="ghost" class="h-8 px-2 lg:px-3" onclick={() => table.resetColumnFilters()}>
      Reset <XIcon />
    </Button>
  {/if}
</div>
```

**Faceted filter options** — derive from live data so options reflect what exists:
```typescript
const statusOptions = $derived(
  [...new Set(items.map((i) => i.status).filter(Boolean))].sort().map((s) => ({ label: s!, value: s! })),
);
```

**Full-page layout with flex + sticky header:**
```svelte
<div class="flex h-full flex-col gap-4">
  <!-- filter toolbar -->
  <div class="flex items-center gap-2">...</div>

  <!-- table fills remaining height -->
  <div class="min-h-0 flex-1">
    <ScrollArea class="h-full rounded-md border" orientation="both">
      <Table.Root>
        <Table.Header class="sticky top-0 z-10 bg-background">
          {#each table.getHeaderGroups() as headerGroup (headerGroup.id)}
            <Table.Row>
              {#each headerGroup.headers as header (header.id)}
                <Table.Head>
                  {#if !header.isPlaceholder}
                    <FlexRender content={header.column.columnDef.header} context={header.getContext()} />
                  {/if}
                </Table.Head>
              {/each}
            </Table.Row>
          {/each}
        </Table.Header>
        <Table.Body>
          {#each table.getRowModel().rows as row (row.id)}
            <Table.Row class="cursor-pointer" onclick={() => goto(`/items/${row.original.slug}`)}>
              {#each row.getVisibleCells() as cell (cell.id)}
                <Table.Cell>
                  <FlexRender content={cell.column.columnDef.cell} context={cell.getContext()} />
                </Table.Cell>
              {/each}
            </Table.Row>
          {:else}
            <Table.Row>
              <Table.Cell colspan={columns.length} class="py-8 text-center text-sm text-muted-foreground">
                No records found.
              </Table.Cell>
            </Table.Row>
          {/each}
        </Table.Body>
      </Table.Root>
    </ScrollArea>
  </div>
</div>
```

### Pattern B: Card-embedded with pagination

Used when the table is one section of a larger page (e.g., activity timelines, logs). Uses `globalFilter` for search and adds pagination.

```typescript
const table = createSvelteTable({
  get data() { return items; },
  columns,
  state: {
    get sorting() { return sorting; },
    get globalFilter() { return globalFilter; },
  },
  onSortingChange: (u) => { sorting = typeof u === "function" ? u(sorting) : u; },
  getCoreRowModel: getCoreRowModel(),
  getFilteredRowModel: getFilteredRowModel(),
  getSortedRowModel: getSortedRowModel(),
  getPaginationRowModel: getPaginationRowModel(),
});
```

```svelte
<Card.Root>
  <Card.Header>
    <Card.Title>Activity Timeline</Card.Title>
    <Card.Action><!-- column visibility toggle --></Card.Action>
  </Card.Header>
  <Card.Content>
    <div class="space-y-3">
      <Input type="search" placeholder="Search..." bind:value={globalFilter} />
      <ScrollArea class="rounded-md border max-h-[40rem]" orientation="both">
        <Table.Root>...</Table.Root>
      </ScrollArea>
      <Pagination ... class="mx-0 w-auto justify-end" />
    </div>
  </Card.Content>
</Card.Root>
```

### General table conventions

- **Column headers:** Always use `DataTableColumnHeader` for sortable columns
- **Custom cells:** Use `renderSnippet` for Svelte snippets, `renderComponent` for components
- **Null values:** Render as `"—"` (em dash `—`), never empty string
- **Badges:** Use colored `Badge` components for status/type columns
- **Monospace:** Use `font-mono` for paths, codes, IDs
- **Empty state:** Always include a colspan `<Table.Cell>` with "No records found."
- **Loading state:** Render `{#each { length: 6 } as _}<Skeleton class="h-10 w-full" />{/each}` while data loads

## Charts (LayerChart)

**Always use LayerChart** (`import { Chart, Layer, Axis, ... } from "layerchart"`) for all charts. Do NOT write raw SVG + D3 from scratch — LayerChart handles scales, axes, responsive sizing, and tooltips. D3 scale helpers (`d3-scale`) are fine to import alongside LayerChart when you need custom band/linear scale config.

### Standard bar/stacked-bar chart

```svelte
<script lang="ts">
  import { Chart, Layer, Axis } from "layerchart";
  import { scaleBand } from "d3-scale";

  function fmtAxis(value: unknown): string {
    const n = Number(value);
    if (n >= 1_000_000) return `$${(n / 1_000_000).toFixed(1)}M`;
    if (n >= 1_000) return `$${(n / 1_000).toFixed(0)}K`;
    return `$${n}`;
  }
</script>

<!-- inside Card.Content (flex flex-1 flex-col min-h-0); .chart-area owns sizing — never h-[Npx] -->
<div class="chart-area">
  <Chart
    class="h-full"
    data={chartData}
    x="month"
    xScale={scaleBand().padding(0.2)}
    y="value"
    yDomain={[0, null]}
    yNice
    padding={{ left: 56, bottom: 40, top: 12, right: 8 }}
  >
    {#snippet children({ context })}
      {@const xs = context.xScale}
      {@const ys = context.yScale}
      <Layer type="svg">
        <Axis placement="left" grid format={fmtAxis} />
        <Axis placement="bottom" rule />
        {#each chartData as d}
          <rect
            x={xs(d.month)}
            y={ys(d.value)}
            width={xs.bandwidth()}
            height={Math.max(0, ys(0) - ys(d.value))}
            fill="var(--chart-2)"
            rx="2"
            class="cursor-pointer transition-opacity hover:opacity-70"
          />
        {/each}
      </Layer>
    {/snippet}
  </Chart>
</div>
```

### Area / line chart

Use the higher-level `AreaChart` (or `LineChart`) component for time-series. Verified
directly against the installed package (`node_modules/layerchart`, v2.0.2 — the docs
site's snippets don't always match this version, so when in doubt read
`node_modules/layerchart/dist/components/charts/*/*.base.svelte` rather than guess):

```svelte
<script lang="ts">
  import { AreaChart, Area, Points } from "layerchart";
  // layerchart doesn't re-export d3-shape's curve functions — import directly,
  // same as $lib/charts/scale.ts already does for d3-scale/d3-array.
  import { curveMonotoneX } from "d3-shape";

  let { data }: { data: { date: Date; count: number }[] } = $props();
</script>

<div class="chart-area">
  <AreaChart {data} x="date" y="count" yDomain={[0, null]} yNice>
    {#snippet marks({ context })}
      {#each context.series.visibleSeries as s (s.key)}
        <Area
          seriesKey={s.key}
          curve={curveMonotoneX}
          fill="var(--chart-1)"
          fillOpacity={0.2}
          line={{ curve: curveMonotoneX, stroke: "var(--chart-1)", "stroke-width": 2 }}
        />
        <Points seriesKey={s.key} r={3} fill="var(--chart-1)" />
      {/each}
    {/snippet}
  </AreaChart>
</div>
```

Gotchas that don't match what you'd guess from the docs site:

- **No default stroke width.** `Spline`/`Area`'s line has no default `stroke-width`,
  so it falls back to the SVG default of `1` — a 1px stroke on a diagonal segment
  with only a handful of points reads as jagged/aliased. Set an explicit width
  (2 is a reasonable default) via `line={{ 'stroke-width': 2 }}`.
- **No default curve.** Without a `curve`, segments are straight lines
  (`curveLinear`), which looks spiky with sparse data (e.g. daily buckets over a
  week). `curveMonotoneX` from `d3-shape` smooths it without overshoot.
- **Dots on every point aren't a boolean prop.** There's no `points={true}` toggle —
  `highlight={{points:true}}` (the default) only shows a point on *hover*. To get an
  always-visible dot per data point, override the `marks` snippet and add a
  `<Points seriesKey={s.key} />` yourself, as above.
- **`marks` fully replaces the default rendering**, it doesn't add to it — if you
  override it (e.g. to add `Points`), you're responsible for re-drawing the
  `Area`/`Spline` too (copy the loop over `context.series.visibleSeries` shown
  above; each chart type's own `*.base.svelte` has the exact default to copy from).
- **Color falls back to `--color-primary`, not `currentColor`.** A series with no
  explicit `color` defaults to `var(--color-primary, currentColor)` — if the app
  defines `--color-primary` (bgg-viewer does), wrapping the chart in a `color: ...`
  CSS rule and expecting it to tint the line via inheritance won't work. Pass
  `fill`/`stroke` (or a `series` color) explicitly instead.
- **The x-axis auto-picks "nice" evenly-spaced ticks, not one per data point.** For
  a handful of daily buckets this lands ticks at noon between day boundaries
  instead of on them. Pin `ticks` to your actual data's x-values (via
  `props={{ xAxis: { ticks: myDates, format: myFormatFn } }}` — a plain function
  works for `format`, it's called as `format(value)`) rather than trusting the
  default tick placement.

Reference: `$lib/charts/TimeSeriesArea.svelte` — a generic bucketed-count-over-time
component built on this pattern.

### Tooltips

For interactive bars/segments rendered manually inside `<Layer>`, use `ChartTooltipPortal` keyed to pointer position:

```svelte
{#if hovered}
  <ChartTooltipPortal x={hovered.x} y={hovered.y}>
    <p class="font-semibold">{hovered.label}</p>
    <p class="text-muted-foreground">{hovered.value}</p>
  </ChartTooltipPortal>
{/if}
```

`ChartTooltipPortal` flips itself away from viewport edges, so right-edge bins don't clip — no manual edge handling needed.

For **line-chart** tooltips, don't attach pointer handlers to the small point circles (tiny, fire only on enter). Render a full-height transparent `<rect>` per bin as the hit area (positioned by the band scale) and drive a crosshair + tooltip from `onpointermove`. Reference: a dashboard over-time chart.

### Chart hover→click detail pattern

For over-time charts where a bin's composition matters ("what made up this week?"), follow the **hover = capped summary, click = full detail** split. Two shared components (`$lib/components/ui/chart/`):

- **`ChartDetailPanel`** — in-card detail panel chrome. Docks full-card-height on the right on wide screens (the host `Card.Root` must be `relative`), stacks below the chart on narrow. Props: `title`, `subtitle?`, `onClose`, optional `totals` snippet, `children` snippet (scrollable body). Owns no data.
- **`ChartBreakdownList`** — the breakdown body. `rows: {id,name,billable,nonBillable,color?,children?}[]`, `top` (number to cap with "+N more", or `false` for uncapped panels), `moreLabel`, `format`, `hint` (the "click for full detail" footer — true for tooltips, false for panels). A `color` swatch links a row to its bar segment; `children` renders indented sub-rows.

Conventions:
- **Hover tooltip** = `ChartBreakdownList` capped (`top={N}`, `hint`) with the "+N more" rollup. Build tooltip rows from the bar's **own segments** (legend top-N + "Other") so every row's swatch matches a real segment — don't re-derive a fresh per-bin top-N (its colors won't match the year-scoped legend).
- **Click** a bar/point → open `ChartDetailPanel` with the full, uncapped (`top={false}`) breakdown. Mark the selected bin (ring on a point, outline on a bar); suppress the hover tooltip while the panel is open; re-clicking the selected bin or the ✕ closes it.
- Pick hover vs. click depth to fit the data: a single-dimension chart is flat both ways; a per-entity chart can show the parent dimension on hover and nest its children in the panel.

Reference: a dashboard over-time chart (flat by colorBy) and a per-entity variant (parent › child).

### Chart colors

Always use CSS variable tokens — never hardcode hex or hsl. See the **style-rules** skill for palette accessibility (max 5–7 colors, colorblind-safe pairs, contrast):

```typescript
// Theme chart palette
"var(--chart-1)"  // primary series
"var(--chart-2)"  // secondary
"var(--chart-3)"  // tertiary
// Semantic status tokens (defined in app.css) — see style-rules:
"var(--color-positive)"
"var(--color-negative)"
```

### When raw SVG is acceptable

Only write raw `<svg>` without LayerChart for cases that are genuinely custom and simple enough that a chart framework adds no value — e.g., a single progress ring, a sparkline with no axes. Always justify the choice in a comment.

## FlipCard Pattern

For data that has both a chart view and a table view, use `FlipCard`:

```svelte
<FlipCard title="User Activity">
  {#snippet front()}
    <!-- chart -->
  {/snippet}
  {#snippet back()}
    <!-- TanStack table -->
  {/snippet}
</FlipCard>
```

The front sizing comes from the `.chart-area` utility (see Layout System → Cards); the back is absolutely positioned and scrolls within it. Do not set a fixed height on the FlipCard.

## KPI Cards

Use `Card.Kpi` for key metrics at the top of dashboard pages. Pass `centered` to vertically center the value; the value font scales with the card width automatically. Place a row of them in an `AutoGrid` so they reflow N→1 by available width:

```svelte
<AutoGrid min="md">
  <Card.Kpi title="Users" items={[{ label: "Total", value: "1,234" }]} centered elevated />
  <Card.Kpi title="Events" items={[{ label: "Today", value: "56K" }]} centered elevated />
  <Card.Kpi title="Errors" items={[{ label: "Last 24h", value: "2" }]} centered elevated />
</AutoGrid>
```

Use a smaller `min` (`"sm"`) for denser KPI strips, larger (`"lg"`/`"xl"`) when each card carries more content. Never wrap KPIs in fixed-height containers.

## Sheets for Secondary CRUD

Use `Sheet` (side panel) instead of separate pages or collapsible cards for managing secondary entities (roles, sessions, sub-records). Pattern:

```svelte
<!-- Main page has Sheet triggers in toolbar -->
<Sheet.Root bind:open={rolesOpen}>
  <Sheet.Trigger asChild let:builder>
    <Button builders={[builder]} variant="outline" size="sm">Roles</Button>
  </Sheet.Trigger>
  <Sheet.Content side="right" class="w-[400px] sm:w-[540px]">
    <Sheet.Header>
      <Sheet.Title>Manage Roles</Sheet.Title>
    </Sheet.Header>
    <RolesSheet bind:initialSearch={roleFilter} />
  </Sheet.Content>
</Sheet.Root>
```

**Sheet conventions:**
- Use card layout (not table) inside sheets for items like roles
- Include search/filter at the top
- Add/Edit via `Dialog` inside the sheet
- Destructive actions (invalidate, delete) require `AlertDialog` confirmation
- Bindable props for cross-communication (e.g., clicking a role badge in the main table opens the roles sheet with that role filtered)

## Component Organization

- **Shared components** → `$lib/components/` (reusable across pages)
- **Route-specific components** → colocated with route files (e.g., `kpi-overview.svelte` next to `+page.svelte`)
- **Private route folders** → prefix with `_` to exclude from SvelteKit routing (e.g., `_nodes/`, `_edges/` for workflow editor components)
- **Navigation** → `routes/(app)/_sidebar/navigation.ts`

### When to colocate vs. extract to $lib

- If only one page uses it → colocate with the route
- If 2+ pages use it → extract to `$lib/components/`
- Large page components should be split into colocated files (e.g., analytics page → `kpi-overview.svelte`, `usage-trends.svelte`, etc.)

## Svelte 5 Patterns

- **Runes:** Use `$state`, `$derived`, `$effect`, `$props` — never Svelte 4 stores for component state
- **Snippets:** Use `{#snippet}` for reusable template fragments within a component (table cells, card content)
- **No `onMount` guards:** Svelte 5 handles transitions natively. Do NOT use `let mounted = false; onMount(() => mounted = true)` with `{#if mounted}` wrappers. Remove these when found.
- **No `animate`/`animateDelay` props:** Cards no longer support animation props. Remove `animate={false}` when found.
- **Context with stores:** For cross-component communication (like header actions), use `setContext` with a writable store:
  ```ts
  const headerActions = writable<Snippet | null>(null);
  setContext("header_actions", headerActions);
  ```

## Error Boundaries

Wrap potentially failing sections with `<svelte:boundary>`:

```svelte
<svelte:boundary onerror={(e) => console.error("Widget error:", e)}>
  <MyWidget />
  {#snippet failed(error, reset)}
    <Card.Root>
      <Card.Content class="flex items-center gap-3 py-8 text-muted-foreground">
        <TriangleAlert class="size-5 text-destructive" />
        <span class="text-sm">Failed to load widget</span>
        <Button variant="outline" size="sm" onclick={reset}>Retry</Button>
      </Card.Content>
    </Card.Root>
  {/snippet}
</svelte:boundary>
```

## View Transitions

Page transitions are handled by the app layout using the View Transitions API. Sidebar and header are pinned with `view-transition-name` so they don't animate on navigation. No per-component transition code needed.

## Client-Side Data Fetching (TanStack Query)

Dashboard components use `@tanstack/svelte-query` for client-side data fetching. The `QueryClient` is provided at the app root and components call `createQuery` directly.

**When to use which pattern:**
- **TanStack Query (`createQuery`):** Dashboard widgets, client-side data that reacts to filter state (year, selection), data that benefits from stale-while-revalidate caching
- **Server load (`+page.server.ts`):** Regular pages that need SSR, auth-gated data

### Query Keys

All query keys are defined in `lib/query/keys.ts` as a `queryKeys` object. Always use these — never inline string arrays:

```ts
import { queryKeys } from '$lib/query/keys'

queryKeys.pipeline(year, selectionKey)      // ['pipeline', year, selectionKey]
```

### Query Functions

All remote query functions live in `lib/data/remote.remote.ts`. Each is declared with `query("unchecked", ...)` from `$app/server`, which returns a `QueryProxy`. In a `createQuery` `queryFn`, return the proxy directly — do NOT call `.run()` (it runs inside `$effect` automatically). Pass the filter state the widget needs as plain props or local `$state`:

```svelte
<script lang="ts">
  import { createQuery } from '@tanstack/svelte-query'
  import { queryKeys } from '$lib/query/keys'
  import { getPipelineData } from '$lib/data/remote.remote'

  let { year, selectionKey }: { year: string; selectionKey: string } = $props();

  const query = createQuery({
    queryKey: queryKeys.pipeline(year, selectionKey),
    queryFn: () => getPipelineData(year, selectionKey),  // returns QueryProxy — no .run()
    staleTime: 5 * 60 * 1000,
    gcTime: 10 * 60 * 1000,
  })
</script>
```

### Loading and Error States

```svelte
{#if $query.isPending}
  <Skeleton />
{:else if $query.isError}
  <ErrorCard error={$query.error} />
{:else}
  <!-- $query.data is typed and available -->
{/if}
```

## Remote Query Functions (`$app/server`)

Dashboard data fetching uses SvelteKit remote query functions declared with `query()` from `$app/server`. Calling one returns a **`QueryProxy`**, not a plain `Promise`. How you consume it depends on where you call it:

| Call site | Context | Correct usage |
|-----------|---------|---------------|
| TanStack `queryFn` | Inside `$effect` (reactive) | Return `QueryProxy` directly — TanStack awaits `.then()` correctly |
| Event handler / `async function` | Outside `$effect` | Call `.run()` first to get a plain `Promise` |
| Template / `$derived` | Reactive | `await` the `QueryProxy` directly |

```svelte
<!-- ✅ TanStack queryFn — QueryProxy returned directly, no .run() -->
const query = createQuery(() => ({
  queryKey: queryKeys.pipeline(y, ck),
  queryFn: () => getPipelineData({ year: y }),
  staleTime: 10 * 60 * 1000,
}));

<!-- ✅ Event handler — must use .run() -->
async function onSelect(opp) {
  const quotes = await getOppQuotes({ opp_id: opp.opp_id }).run();
}
```

**Why:** `QueryProxy` checks `is_in_effect()` at construction time. If `true` (reactive context), `.then()` works but `.run()` throws. If `false` (event handler), `.run()` works but `.then()` throws. TanStack's `queryFn` is called inside `$effect`, so it is always in a reactive context.

## Component Primitives

### Card.Controls

Slot-aware action bar rendered inside `Card.Header`. Provides standard icon buttons for info tooltip, fullscreen expand, and CSV download — plus a `children` slot for custom actions.

```ts
import { Card } from '$lib/components/ui/card'
```

**Props:**
- `info?: string` — tooltip text shown via an Info icon
- `title?: string` — title shown in the fullscreen dialog header
- `fullscreenContent?: Snippet` — if provided, renders an expand button that opens a full-screen dialog with this content
- `download?: () => void` — if provided, renders a Download icon button that calls this function
- `children?: Snippet` — additional custom action buttons

**Usage:**
```svelte
<Card.Header>
  <Card.Title>Pipeline Overview</Card.Title>
  <Card.Controls
    info="Shows closed and open pipeline by quarter"
    title="Pipeline Overview"
    {fullscreenContent}
    download={handleDownload}
  />
</Card.Header>
```

### createTableState()

Svelte 5 composable from `$lib/components/ui/data-table/create-table-state.svelte.ts`. Wraps TanStack Table with reactive state for global filter, column filters, sorting, column visibility, and pagination. Returns a `table` instance plus reactive accessors.

```ts
import { createTableState } from '$lib/components/ui/data-table'
```

**Options:**
- `data: () => T[]` — reactive data getter (use a `$derived` or getter fn)
- `columns: ColumnDef<T>[]` — TanStack column definitions
- `initialColumnVisibility?: VisibilityState`
- `initialSorting?: SortingState`
- `pageSize?: number` — default 25
- `globalFilterFn?: FilterFnOption<T>` — default `"includesString"`

**Returns:**
- `table` — TanStack `Table<T>` instance
- `globalFilter` / setter — bound to search inputs
- `isFiltered` — `$derived` boolean, true if any filter is active
- `clear()` — resets all filters and pagination

**Usage:**
```ts
const ts = createTableState({
  data: () => $query.data ?? [],
  columns,
  pageSize: 50,
})
```

### DataTable.* Sub-Components

Composable sub-components imported from `$lib/components/ui/data-table`. Use `DataTable` namespace for clean call sites:

```ts
import { DataTable } from '$lib/components/ui/data-table'
```

| Component | Purpose |
|---|---|
| `DataTable.Root` | Main table wrapper — renders `<table>` with headers and rows |
| `DataTable.Search` | Global filter text input — bind to `ts.globalFilter` |
| `DataTable.Clear` | Reset button — shown when `ts.isFiltered`, calls `ts.clear()` |
| `DataTable.ColumnToggle` | Column visibility dropdown |
| `DataTable.Filter` | Faceted filter for a specific column (Pattern A only) |
| `DataTable.Pagination` | Page controls (Pattern B only) |

**Pattern A (full-page table with faceted filters, no pagination):**
```svelte
<div class="flex items-center gap-2 pb-4">
  <DataTable.Search bind:value={ts.globalFilter} />
  <DataTable.Filter {table} columnId="status" title="Status" options={statusOptions} />
  {#if ts.isFiltered}
    <DataTable.Clear onclick={ts.clear} />
  {/if}
  <DataTable.ColumnToggle {table} class="ml-auto" />
</div>
<DataTable.Root {table} />
```

**Pattern B (embedded table in Card with pagination):**
```svelte
<Card.Root>
  <Card.Header>
    <DataTable.Search bind:value={ts.globalFilter} class="max-w-sm" />
  </Card.Header>
  <Card.Content>
    <DataTable.Root {table} />
  </Card.Content>
  <Card.Footer>
    <DataTable.Pagination {table} />
  </Card.Footer>
</Card.Root>
```

## Verify

Before calling a page done:

- **Types:** `pnpm exec svelte-check --tsconfig ./tsconfig.json` — zero errors.
- **Visual:** run the dev server (`pnpm dev`) and open the page.
- **Light AND dark:** toggle the theme and confirm both. Never ship one mode.
- **Color accessibility:** chart/status colors follow the `style-rules` skill
  (no color-only encodings, colorblind-safe pairs, contrast).

## Checklist — New Page

- [ ] Server load returns `breadcrumbs` and `subtitle`
- [ ] Layout uses `Stack` / `AutoGrid` / `Split` from `$lib/components/ui/layout`
- [ ] Content-driven pages emit a sequence of regions and scroll vertically; fill-height pages (primary tables / master-detail / canvas) use page root `flex min-h-0 flex-1 flex-col` with the table/pane in a `flex-1 min-h-0` region
- [ ] No `svh`/`vh` or fixed `h-[Npx]` on content
- [ ] No inline page header — header comes from layout
- [ ] Tables use TanStack with `DataTableColumnHeader`
  - [ ] Full-page tables: Pattern A (faceted filters, no pagination, fill-height flex, internal scroll, snapshot)
  - [ ] Embedded tables: Pattern B (globalFilter, Card wrap, Pagination) — bound at `max-h-[40rem] min-h-0` with internal scroll
- [ ] Charts use LayerChart — no raw SVG+D3 unless genuinely trivial and justified
- [ ] Chart cards use the `.chart-area` utility (no `aspect-[]`, `self-start`, `h-full`, or fixed height on the card)
- [ ] Cards use standard Card components (fluid typography is automatic)
- [ ] KPIs use `Card.Kpi` with `centered`, laid out in an `AutoGrid`
- [ ] Secondary CRUD uses Sheets, not separate pages
- [ ] No `onMount`/`mounted` guards for transitions
- [ ] No `animate`/`animateDelay` props on Cards
- [ ] Error boundaries around potentially failing sections
- [ ] Verified: svelte-check clean, dev server visual check, light + dark both tested

> Worked reference: `references/example-page.svelte` + `references/example-page.server.ts` — a full page exercising load → KPIs → chart → table.
