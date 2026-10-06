<script lang="ts">
  import { goto } from '$app/navigation';
  import { page } from '$app/state';
  import { Container, Stack } from '$lib/components/ui/layout';
  import LineageGraph from '$lib/monitoring/LineageGraph.svelte';
  import TableDetail from '$lib/monitoring/TableDetail.svelte';
  import { clock, freshnessReference } from '$lib/monitoring/display';
  import type { LineageNode } from '$lib/server/warehouse';
  import type { PageData } from './$types';

  let { data }: { data: PageData } = $props();

  const reference = $derived(
    data.pipeline
      ? freshnessReference(data.pipeline.today)
      : `${new Date().toISOString().slice(0, 10)}T05:00:00Z`
  );
  const byId = $derived(new Map((data.lineage?.nodes ?? []).map((n) => [n.id, n])));
  const selectedId = $derived(page.url.searchParams.get('node'));
  const selected = $derived(selectedId ? (byId.get(selectedId) ?? null) : null);
  const neighbours = (dir: 0 | 1) =>
    (data.lineage?.edges ?? [])
      .filter((e) => e[1 - dir] === selected?.id)
      .map((e) => byId.get(e[dir]))
      .filter((n): n is LineageNode => !!n);
  const tableRow = $derived(
    selected && selected.project === 'bgg-data-warehouse'
      ? (data.pipeline?.tables.find((t) => t.table === `${selected.dataset}.${selected.name}`) ?? null)
      : null
  );

  function select(id: string) {
    const url = new URL(page.url);
    url.searchParams.set('node', id);
    goto(url, { replaceState: true, noScroll: true, keepFocus: true });
  }
</script>

<svelte:head><title>Lineage · Boardgame-Viz</title></svelte:head>

<Container>
  <Stack>
    <header class="head">
      <h1>Lineage</h1>
      {#if data.lineage}
        <span>
          Dataform compilation {data.lineage.compilation.commit ?? ''} · {clock(data.lineage.compilation.created)} UTC ·
          {data.lineage.nodes.length} tables
        </span>
      {/if}
    </header>

    {#if data.error || !data.lineage}
      <div class="err" role="alert">
        <b>Couldn't load the lineage.</b>
        <p>{data.error}</p>
      </div>
    {:else}
      <div class="layout" class:with-panel={!!selected}>
        <LineageGraph
          nodes={data.lineage.nodes}
          edges={data.lineage.edges}
          selected={selected?.id ?? null}
          {reference}
          onselect={select}
        />
        {#if selected}
          <TableDetail
            node={selected}
            upstream={neighbours(0)}
            downstream={neighbours(1)}
            {reference}
            {tableRow}
            onselect={select}
          />
        {/if}
      </div>
      {#if !selected}<p class="hint">Click a table to see its status, rows and schema.</p>{/if}
    {/if}
  </Stack>
</Container>

<style>
  .head { display: flex; align-items: baseline; gap: 0.75rem; flex-wrap: wrap; }
  .head h1 { margin: 0; font-size: var(--text-heading); }
  .head span, .hint { color: var(--muted-foreground); font-size: 0.8rem; }
  .layout { display: grid; grid-template-columns: minmax(0, 1fr); gap: var(--space-lg); align-items: start; }
  .layout.with-panel { grid-template-columns: minmax(0, 1fr) 22rem; }
  @media (max-width: 900px) { .layout.with-panel { grid-template-columns: minmax(0, 1fr); } }
  .err { background: var(--card); border: 1px solid var(--border); border-left: 4px solid var(--status-fail); border-radius: var(--radius); padding: var(--space-lg); }
  .err p { margin: 0.3rem 0 0; color: var(--muted-foreground); font-family: ui-monospace, Menlo, monospace; font-size: 0.82rem; }
</style>
