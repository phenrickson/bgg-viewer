<script lang="ts">
  import type { PipelineTableRow } from '$lib/server/warehouse';
  import StatusBadge from './StatusBadge.svelte';
  import { clock, coverage, freshness } from './display';

  let {
    tables,
    catalog,
    reference
  }: { tables: PipelineTableRow[]; catalog: { builtAt: string; rows: number } | null; reference: string } = $props();

  const fmt = new Intl.NumberFormat('en-US');
  const day = (iso: string | null) =>
    iso ? new Date(iso).toLocaleDateString('en-US', { month: 'short', day: 'numeric', timeZone: 'UTC' }) : '—';
  const group = (t: string) => (t.startsWith('predictions.') ? 'Predictions' : 'Warehouse');
</script>

{#snippet fresh(last: string | null)}
  {@const f = freshness(last, reference)}
  <StatusBadge status={f.tone === 'ok' ? 'ok' : 'warn'} label={f.label} />
{/snippet}

<div class="card scroll">
  <table>
    <thead><tr><th>Table</th><th>Status</th><th>Last updated (UTC)</th><th class="num">Games</th><th>Coverage</th></tr></thead>
    <tbody>
      {#each tables as t, i (t.table)}
        {#if i === 0 || group(t.table) !== group(tables[i - 1].table)}
          <tr class="group"><td colspan="5">{group(t.table)}</td></tr>
        {/if}
        {@const c = coverage(t.covered, t.universe)}
        <tr>
          <td class="mono">{t.table}{#if t.users != null}<div class="sub">{t.users} users</div>{/if}</td>
          <td>{@render fresh(t.last_updated)}</td>
          <td class="tnum">{day(t.last_updated)} · {clock(t.last_updated)}</td>
          <td class="num">{fmt.format(t.games)}</td>
          <td>
            {#if c}
              <div class="cov" class:low={c.low}>
                <div class="bar"><b style="width: {(c.pct * 100).toFixed(1)}%"></b></div>
                <span class="tnum">{(c.pct * 100).toFixed(1)}%</span>
              </div>
            {:else}<span class="sub">—</span>{/if}
          </td>
        </tr>
      {/each}
      <tr class="group"><td colspan="5">Viewer</td></tr>
      <tr>
        <td class="mono">catalog artifact (GCS)</td>
        {#if catalog}
          <td>{@render fresh(catalog.builtAt)}</td>
          <td class="tnum">{day(catalog.builtAt)} · {clock(catalog.builtAt)}</td>
          <td class="num">{fmt.format(catalog.rows)}</td>
        {:else}
          <td colspan="3" class="sub">Pointer unavailable</td>
        {/if}
        <td><span class="sub">—</span></td>
      </tr>
    </tbody>
  </table>
</div>

<style>
  .card { background: var(--card); border: 1px solid var(--border); border-radius: var(--radius); }
  .scroll { overflow-x: auto; }
  table { width: 100%; border-collapse: collapse; font-size: 0.83rem; }
  th { text-align: left; font-weight: 500; font-size: 0.72rem; text-transform: uppercase; letter-spacing: 0.08em; color: var(--muted-foreground); padding: 0.55rem 0.75rem; border-bottom: 1px solid var(--border); white-space: nowrap; }
  td { padding: 0.5rem 0.75rem; border-top: 1px solid var(--border); vertical-align: middle; }
  tr.group td { background: var(--muted); font-size: 0.7rem; text-transform: uppercase; letter-spacing: 0.1em; color: var(--muted-foreground); font-weight: 600; padding: 0.3rem 0.75rem; }
  .num { text-align: right; font-variant-numeric: tabular-nums; }
  .mono { font-family: ui-monospace, Menlo, monospace; font-size: 0.78rem; }
  .sub { color: var(--muted-foreground); font-size: 0.75rem; font-family: inherit; }
  .cov { display: flex; align-items: center; gap: 0.5rem; min-width: 9rem; }
  .bar { flex: 1; height: 0.45rem; background: var(--muted); border-radius: 999px; overflow: hidden; }
  .bar b { display: block; height: 100%; background: var(--status-ok); border-radius: 999px; }
  .cov.low .bar b { background: var(--status-warn); }
  .tnum { font-variant-numeric: tabular-nums; }
</style>
