<script lang="ts">
  import type { PipelineStage, PipelineStatus } from '$lib/server/warehouse';
  import StatusBadge from './StatusBadge.svelte';
  import { STATUS_GLYPH, STATUS_WORD } from './display';

  let { history, stages }: { history: PipelineStatus['history']; stages: PipelineStage[] } = $props();
  const dayLabel = (d: string, i: number) => (i === history.length - 1 ? 'today' : String(Number(d.slice(8, 10))));
</script>

<div class="card">
  <div class="legend">
    <StatusBadge status="ok" /><StatusBadge status="warn" /><StatusBadge status="fail" /><StatusBadge status="not_reached" />
  </div>
  <div class="scroll">
    <table>
      <thead><tr><th></th>{#each history as h, i (h.day)}<th class="tnum">{dayLabel(h.day, i)}</th>{/each}</tr></thead>
      <tbody>
        {#each stages as s (s.key)}
          <tr>
            <th scope="row">{s.label}</th>
            {#each history as h (h.day)}
              {@const st = h.stages[s.key] ?? 'not_reached'}
              <td class={st} title="{s.label} · {h.day} · {STATUS_WORD[st]}">{STATUS_GLYPH[st]}</td>
            {/each}
          </tr>
        {/each}
      </tbody>
    </table>
  </div>
</div>

<style>
  .card { background: var(--card); border: 1px solid var(--border); border-radius: var(--radius); }
  .legend { display: flex; gap: var(--space-lg); flex-wrap: wrap; padding: 0.6rem 0.75rem 0; }
  .scroll { overflow-x: auto; padding: 0.4rem 0.5rem 0.75rem; }
  table { border-collapse: separate; border-spacing: 3px; font-size: 0.75rem; min-width: 34rem; width: 100%; }
  th { font-weight: 500; color: var(--muted-foreground); text-align: left; white-space: nowrap; padding-right: 0.6rem; }
  thead th { text-align: center; font-size: 0.68rem; padding: 0; }
  td { height: 1.15rem; border-radius: 3px; text-align: center; font-size: 0.62rem; font-weight: 700; color: var(--card); }
  /* Healthy recedes; problems carry the ink. */
  td.ok { background: color-mix(in oklch, var(--status-ok) 28%, var(--card)); color: color-mix(in oklch, var(--status-ok) 70%, var(--card)); }
  td.warn { background: var(--status-warn); color: oklch(0.25 0.02 260); }
  td.fail { background: var(--status-fail); }
  td.running, td.pending, td.not_reached { background: transparent; box-shadow: inset 0 0 0 1.5px var(--border); }
  .tnum { font-variant-numeric: tabular-nums; }
</style>
