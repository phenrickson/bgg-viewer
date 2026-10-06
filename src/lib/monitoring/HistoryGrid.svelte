<script lang="ts">
  import type { PipelineStage, PipelineStatus } from '$lib/server/warehouse';
  import StatusBadge from './StatusBadge.svelte';
  import { historyCell, historyDay, STATUS_GLYPH, STATUS_WORD } from './display';

  let { history, stages }: { history: PipelineStatus['history']; stages: PipelineStage[] } = $props();
  const dayLabel = (d: string, i: number) => (i === history.length - 1 ? 'today' : String(Number(d.slice(8, 10))));
</script>

<div class="card">
  <div class="legend">
    <StatusBadge status="ok" /><StatusBadge status="warn" /><StatusBadge status="fail" /><StatusBadge status="not_reached" />
    <span class="old-note">Faded column: the old chain (before 7 Oct)</span>
  </div>
  <div class="scroll">
    <table>
      <thead><tr><th></th>{#each history as h, i (h.day)}<th class="tnum">{dayLabel(h.day, i)}</th>{/each}</tr></thead>
      <tbody>
        {#each stages as s, si (s.key)}
          <tr>
            <th scope="row">{s.label}</th>
            {#each history as h (h.day)}
              {@const d = historyDay(h)}
              {#if d.era === 'old'}
                {#if si === 0}
                  <td class="old {d.cell.status}" rowspan={stages.length} title="{h.day} · old chain · {STATUS_WORD[d.cell.status]}">
                    {#if d.cell.url}
                      <a href={d.cell.url} target="_blank" rel="noreferrer" aria-label="Old chain on {h.day}: {STATUS_WORD[d.cell.status]}, open run">{STATUS_GLYPH[d.cell.status]}</a>
                    {:else}{STATUS_GLYPH[d.cell.status]}{/if}
                  </td>
                {/if}
              {:else}
                {@const cell = historyCell(d.stages[s.key])}
                <td class={cell.status} class:side-fail={cell.side === 'fail'}
                    title="{s.label} · {h.day} · {STATUS_WORD[cell.status]}{cell.side === 'fail' ? ' · a collection step failed' : ''}">
                  {#if cell.url}
                    <a href={cell.url} target="_blank" rel="noreferrer" aria-label="{s.label} on {h.day}: {STATUS_WORD[cell.status]}, open run">{STATUS_GLYPH[cell.status]}</a>
                  {:else}{STATUS_GLYPH[cell.status]}{/if}
                </td>
              {/if}
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
  /* Fixed layout: the stage-name column is set, every day column gets an equal share. */
  table { border-collapse: separate; border-spacing: 3px; font-size: 0.75rem; min-width: 34rem; width: 100%; table-layout: fixed; }
  th { font-weight: 500; color: var(--muted-foreground); text-align: left; white-space: nowrap; padding-right: 0.6rem; }
  thead th { text-align: center; font-size: 0.68rem; padding: 0; }
  thead th:first-child { width: 9.5rem; }
  td { height: 1.15rem; border-radius: 3px; text-align: center; font-size: 0.62rem; font-weight: 700; color: var(--card); }
  /* Healthy recedes; problems carry the ink. */
  td.ok { background: color-mix(in oklch, var(--status-ok) 28%, var(--card)); color: color-mix(in oklch, var(--status-ok) 70%, var(--card)); }
  td.warn { background: var(--status-warn); color: oklch(0.25 0.02 260); }
  td.fail { background: var(--status-fail); }
  td.running, td.pending, td.not_reached { background: transparent; box-shadow: inset 0 0 0 1.5px var(--border); }
  .tnum { font-variant-numeric: tabular-nums; }
  td.old { opacity: 0.55; vertical-align: middle; }
  td.side-fail { box-shadow: inset -5px 5px 0 -2px var(--status-warn); }
  .old-note { font-size: 0.72rem; color: var(--muted-foreground); }
  td a { display: block; color: inherit; text-decoration: none; }
  td a:hover { outline: 2px solid var(--foreground); outline-offset: -2px; border-radius: 3px; }
</style>
