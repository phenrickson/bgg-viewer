<script lang="ts">
  import type { DeployedModelRow } from '$lib/server/warehouse';
  import StatusBadge from './StatusBadge.svelte';
  import { clock, isStale, modelKey, servedLabel, splitModels } from './display';

  let { models, generatedAt }: { models: DeployedModelRow[]; generatedAt: string } = $props();
  const day = (iso: string | null) =>
    iso ? new Date(iso).toLocaleDateString('en-US', { month: 'short', day: 'numeric', timeZone: 'UTC' }) : '—';
  const split = $derived(splitModels(models));
</script>

{#snippet when(m: DeployedModelRow)}
  <td class="tnum">
    {day(m.last_scored)} · {clock(m.last_scored)}
    {#if isStale(m.last_scored, generatedAt)}<StatusBadge status="warn" label="Stale" />{/if}
  </td>
{/snippet}

<div class="card scroll">
  <table>
    <caption>Scoring models</caption>
    <thead><tr><th>Step</th><th>Model</th><th>Version</th><th class="num">Serving</th><th>Last scored (UTC)</th></tr></thead>
    <tbody>
      {#each split.game as m, i ('missing' in m ? `${m.model_type}|missing` : `${modelKey(m)}|${i}`)}
        <tr>
          <td>{m.model_type}</td>
          {#if 'missing' in m}
            <td colspan="4"><StatusBadge status="warn" label="No run in 30 days" /></td>
          {:else}
            <td class="mono">{m.model_name ?? '—'}</td>
            <td class="mono">{m.model_version != null ? `v${m.model_version}` : '—'}</td>
            <td class="num">{servedLabel(m.games_served, m.games_total)}</td>
            {@render when(m)}
          {/if}
        </tr>
      {/each}
    </tbody>
  </table>
</div>

<div class="card scroll">
  <table>
    <caption>Collections</caption>
    <thead><tr><th>User</th><th>Outcome</th><th>Model</th><th>Version</th><th class="num">Serving</th><th>Last scored (UTC)</th></tr></thead>
    <tbody>
      {#each split.collections as m, i (`${modelKey(m)}|${i}`)}
        <tr>
          <td>{m.username}</td>
          <td>{m.model_type}</td>
          <td class="mono">{m.model_name ?? '—'}</td>
          <td class="mono">{m.model_version != null ? `v${m.model_version}` : '—'}</td>
          <td class="num">{servedLabel(m.games_served, m.games_total)}</td>
          {@render when(m)}
        </tr>
      {:else}
        <tr><td colspan="6" class="sub">No collection scoring in 30 days.</td></tr>
      {/each}
    </tbody>
  </table>
</div>

<style>
  .card { background: var(--card); border: 1px solid var(--border); border-radius: var(--radius); }
  .card + .card { margin-top: var(--space-md); }
  .scroll { overflow-x: auto; }
  table { width: 100%; border-collapse: collapse; font-size: 0.83rem; }
  caption { text-align: left; font-weight: 600; font-size: 0.85rem; padding: 0.55rem 0.75rem 0; }
  th { text-align: left; font-weight: 500; font-size: 0.72rem; text-transform: uppercase; letter-spacing: 0.08em; color: var(--muted-foreground); padding: 0.55rem 0.75rem; border-bottom: 1px solid var(--border); white-space: nowrap; }
  td { padding: 0.5rem 0.75rem; border-top: 1px solid var(--border); }
  .num { text-align: right; font-variant-numeric: tabular-nums; }
  .mono { font-family: ui-monospace, Menlo, monospace; font-size: 0.78rem; }
  .sub { color: var(--muted-foreground); font-size: 0.75rem; }
  .tnum { font-variant-numeric: tabular-nums; }
</style>
