<script lang="ts">
  import type { DeployedModelRow } from '$lib/server/warehouse';
  import StatusBadge from './StatusBadge.svelte';
  import { clock, modelKey } from './display';

  // Rows arrive ordered by category, type, newest first, so any row after the first
  // of its type is an older version still serving some games.

  let { models }: { models: DeployedModelRow[] } = $props();
  const fmt = new Intl.NumberFormat('en-US');
  const day = (iso: string | null) =>
    iso ? new Date(iso).toLocaleDateString('en-US', { month: 'short', day: 'numeric', timeZone: 'UTC' }) : '—';
</script>

<div class="card scroll">
  <table>
    <thead><tr><th>Model</th><th>Version</th><th class="num">Games</th><th>Last scored (UTC)</th></tr></thead>
    <tbody>
      {#each models as m, i (modelKey(m))}
        {@const older = i > 0 && models[i - 1].model_type === m.model_type}
        <tr>
          <td>
            {m.model_type}<div class="sub mono">{m.model_name ?? '—'}</div>
            {#if older}<StatusBadge status="warn" label="Older version still serving" />{/if}
          </td>
          <td class="mono">{m.model_version != null ? `v${m.model_version}` : '—'}</td>
          <td class="num">{fmt.format(m.games_count)}</td>
          <td class="tnum">{day(m.last_updated)} · {clock(m.last_updated)}</td>
        </tr>
      {/each}
    </tbody>
  </table>
</div>

<style>
  .card { background: var(--card); border: 1px solid var(--border); border-radius: var(--radius); }
  .scroll { overflow-x: auto; }
  table { width: 100%; border-collapse: collapse; font-size: 0.83rem; }
  th { text-align: left; font-weight: 500; font-size: 0.72rem; text-transform: uppercase; letter-spacing: 0.08em; color: var(--muted-foreground); padding: 0.55rem 0.75rem; border-bottom: 1px solid var(--border); white-space: nowrap; }
  td { padding: 0.5rem 0.75rem; border-top: 1px solid var(--border); }
  .num { text-align: right; font-variant-numeric: tabular-nums; }
  .mono { font-family: ui-monospace, Menlo, monospace; font-size: 0.78rem; }
  .sub { color: var(--muted-foreground); font-size: 0.75rem; }
  .tnum { font-variant-numeric: tabular-nums; }
</style>
