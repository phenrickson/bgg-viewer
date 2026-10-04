<script lang="ts">
  import type { LineageNode, PipelineTableRow, SchemaField } from '$lib/server/warehouse';
  import StatusBadge from './StatusBadge.svelte';
  import { clock, coverage, nodeStatus } from './display';

  let {
    node,
    upstream,
    downstream,
    reference,
    tableRow,
    onselect
  }: {
    node: LineageNode;
    upstream: LineageNode[];
    downstream: LineageNode[];
    reference: string;
    tableRow: PipelineTableRow | null;
    onselect: (id: string) => void;
  } = $props();

  const fmt = new Intl.NumberFormat('en-US');
  const size = (b: number | null) =>
    b == null ? '—' : b > 1e9 ? `${(b / 1e9).toFixed(1)} GB` : b > 1e6 ? `${(b / 1e6).toFixed(1)} MB` : `${(b / 1e3).toFixed(0)} KB`;
  const day = (iso: string | null) =>
    iso ? new Date(iso).toLocaleDateString('en-US', { month: 'short', day: 'numeric', timeZone: 'UTC' }) : '—';
  const status = $derived(nodeStatus(node, reference));
  const cov = $derived(tableRow ? coverage(tableRow.covered, tableRow.universe) : null);

  let schema = $state<SchemaField[] | null>(null);
  let schemaError = $state<string | null>(null);
  $effect(() => {
    const id = node.id;
    schema = null;
    schemaError = null;
    if (node.error) return;
    // Abort a slow response for a node that is no longer selected, so it can't overwrite this one.
    const ctrl = new AbortController();
    fetch(`/admin/lineage/schema?id=${encodeURIComponent(id)}`, { signal: ctrl.signal })
      .then(async (r) => {
        if (!r.ok) throw new Error((await r.json().catch(() => null))?.message ?? `HTTP ${r.status}`);
        return r.json();
      })
      .then((body) => (schema = body.schema))
      .catch((e) => {
        if (e.name !== 'AbortError') schemaError = e.message;
      });
    return () => ctrl.abort();
  });
</script>

<aside class="panel" aria-label="Table details">
  <p class="kind">{node.kind}{node.project !== 'bgg-data-warehouse' ? ` · ${node.project}` : ''}</p>
  <h3>{node.dataset}.{node.name}</h3>
  <p class="id mono">{node.id}</p>

  <dl>
    <dt>Status</dt>
    <dd>
      {#if node.error}<StatusBadge status="not_reached" label={node.error} />
      {:else if status}<StatusBadge status={status.tone === 'ok' ? 'ok' : 'warn'} label={status.label} />
      {:else}<span class="muted">—</span>{/if}
    </dd>
    <dt>Rows</dt>
    <dd class="tnum">{node.kind === 'view' ? 'view' : node.rows == null ? '—' : fmt.format(node.rows)}</dd>
    <dt>Size</dt>
    <dd class="tnum">{size(node.bytes)}</dd>
    <dt>Last modified</dt>
    <dd class="tnum">{day(node.last_modified)} · {clock(node.last_modified)} UTC</dd>
    {#if cov}
      <dt>Coverage</dt>
      <dd class="tnum">{(cov.pct * 100).toFixed(1)}%</dd>
    {/if}
  </dl>

  {#snippet links(label: string, list: LineageNode[])}
    <h4>{label}</h4>
    {#if list.length}
      <ul class="links">
        {#each list as n (n.id)}
          <li><button type="button" onclick={() => onselect(n.id)}>{n.dataset}.{n.name}</button></li>
        {/each}
      </ul>
    {:else}<p class="muted">None</p>{/if}
  {/snippet}
  {@render links('Upstream', upstream)}
  {@render links('Downstream', downstream)}

  <h4>Schema</h4>
  {#if node.error}<p class="muted">Not readable: {node.error}</p>
  {:else if schemaError}<p class="muted">{schemaError}</p>
  {:else if !schema}<p class="muted">Loading…</p>
  {:else}
    <table class="schema">
      <tbody>
        {#each schema as f (f.name)}
          <tr>
            <td class="mono">{f.name}</td>
            <td class="mono muted">{f.type}{f.mode === 'REPEATED' ? '[]' : ''}</td>
          </tr>
          {#if f.description}<tr class="desc"><td colspan="2">{f.description}</td></tr>{/if}
        {/each}
      </tbody>
    </table>
  {/if}
</aside>

<style>
  .panel { background: var(--card); border: 1px solid var(--border); border-radius: var(--radius); padding: var(--space-lg); min-width: 0; }
  .kind { margin: 0; font-size: 0.72rem; text-transform: uppercase; letter-spacing: 0.08em; color: var(--muted-foreground); }
  h3 { margin: 0.15rem 0 0; font-size: 1.05rem; overflow-wrap: anywhere; }
  .id { margin: 0.2rem 0 var(--space-md); font-size: 0.72rem; color: var(--muted-foreground); overflow-wrap: anywhere; }
  dl { display: grid; grid-template-columns: auto 1fr; gap: 0.35rem 0.75rem; margin: 0 0 var(--space-md); font-size: 0.85rem; }
  dt { color: var(--muted-foreground); }
  dd { margin: 0; }
  h4 { margin: var(--space-md) 0 0.3rem; font-size: 0.8rem; text-transform: uppercase; letter-spacing: 0.08em; color: var(--muted-foreground); }
  .links { list-style: none; margin: 0; padding: 0; display: flex; flex-wrap: wrap; gap: 0.3rem; }
  .links button { font: 0.78rem ui-monospace, Menlo, monospace; background: var(--muted); border: 1px solid var(--border); border-radius: 6px; padding: 0.15rem 0.45rem; color: var(--foreground); cursor: pointer; }
  .schema { width: 100%; border-collapse: collapse; font-size: 0.8rem; }
  .schema td { padding: 0.25rem 0.4rem 0.25rem 0; border-top: 1px solid var(--border); vertical-align: top; overflow-wrap: anywhere; }
  .schema tr.desc td { border-top: none; padding-top: 0; font-size: 0.74rem; color: var(--muted-foreground); }
  .mono { font-family: ui-monospace, Menlo, monospace; }
  .muted { color: var(--muted-foreground); font-size: 0.82rem; margin: 0; }
  .tnum { font-variant-numeric: tabular-nums; }
</style>
