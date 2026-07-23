<script lang="ts">
  import { page } from '$app/state';
  import { Stack, AutoGrid } from '$lib/components/ui/layout';
  import { Card } from '$lib/components/ui/card';
  import { DataTable, createTableState } from '$lib/components/ui/data-table';
  import { Chart, Layer, Axis } from 'layerchart';
  import { scaleBand } from 'd3-scale';
  import type { ColumnDef } from '@tanstack/table-core';

  const data = $derived(page.data);

  type Widget = { id: string; name: string; active: boolean; count: number };

  const columns: ColumnDef<Widget>[] = [
    { accessorKey: 'name', header: 'Name', cell: ({ row }) => row.getValue('name') },
    { accessorKey: 'count', header: 'Count', cell: ({ getValue }) => getValue() ?? '—' },
  ];

  const ts = createTableState({ data: () => data.widgets ?? [], columns, pageSize: 25 });

  const chartData = $derived(
    (data.widgets ?? []).map((w: Widget) => ({ name: w.name, value: w.count })),
  );
</script>

<Stack gap="lg">
  <!-- KPIs reflow N→1 by width -->
  <AutoGrid min="md">
    <Card.Kpi title="Widgets" items={[{ label: 'Total', value: String(data.kpis.total) }]} centered elevated />
    <Card.Kpi title="Active" items={[{ label: 'Now', value: String(data.kpis.active) }]} centered elevated />
    <Card.Kpi title="Errors" items={[{ label: 'Open', value: String(data.kpis.errors) }]} centered elevated />
  </AutoGrid>

  <!-- Chart card: .chart-area owns sizing, no fixed height -->
  <Card.Root class="flex flex-col min-w-0">
    <Card.Header><Card.Title>Widgets by count</Card.Title></Card.Header>
    <Card.Content class="flex flex-1 flex-col min-h-0">
      <div class="chart-area">
        <Chart
          class="h-full"
          data={chartData}
          x="name"
          xScale={scaleBand().padding(0.2)}
          y="value"
          yDomain={[0, null]}
          yNice
          padding={{ left: 48, bottom: 40, top: 12, right: 8 }}
        >
          {#snippet children({ context })}
            {@const xs = context.xScale}
            {@const ys = context.yScale}
            <Layer type="svg">
              <Axis placement="left" grid />
              <Axis placement="bottom" rule />
              {#each chartData as d}
                <rect
                  x={xs(d.name)}
                  y={ys(d.value)}
                  width={xs.bandwidth()}
                  height={Math.max(0, ys(0) - ys(d.value))}
                  fill="var(--chart-1)"
                  rx="2"
                />
              {/each}
            </Layer>
          {/snippet}
        </Chart>
      </div>
    </Card.Content>
  </Card.Root>

  <!-- Embedded paginated table (Pattern B) -->
  <Card.Root>
    <Card.Header>
      <DataTable.Search bind:value={ts.globalFilter} class="max-w-sm" />
    </Card.Header>
    <Card.Content>
      <DataTable.Root table={ts.table} />
    </Card.Content>
    <Card.Footer>
      <DataTable.Pagination table={ts.table} />
    </Card.Footer>
  </Card.Root>
</Stack>
