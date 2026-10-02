<script lang="ts">
  import type { Lane, PipelineStage } from '$lib/server/warehouse';
  import StatusBadge from './StatusBadge.svelte';
  import { clock, duration } from './display';

  let { stages, offChain }: { stages: PipelineStage[]; offChain: PipelineStage[] } = $props();

  const LANES: { key: Lane; label: string; repo: string }[] = [
    { key: 'warehouse', label: 'Warehouse', repo: 'bgg-data-warehouse' },
    { key: 'models', label: 'Models', repo: 'bgg-predictive-models' },
    { key: 'viewer', label: 'Viewer', repo: 'bgg-viewer' }
  ];
</script>

{#snippet card(s: PipelineStage)}
  <div class="step {s.status}">
    <div class="n">
      <span>{s.label}</span>
      {#if s.url}<a href={s.url} target="_blank" rel="noreferrer">run ↗</a>{/if}
    </div>
    <div class="d">
      <span class="lane-tag">{s.lane} ·</span>
      <StatusBadge status={s.status} />
      {#if s.finished}<span class="tnum">{duration(s.started, s.finished)}</span>{/if}
    </div>
    {#if s.note}<div class="note">{s.note}</div>{/if}
  </div>
{/snippet}

<div class="card">
  <div class="lanes">
    <div class="lh">Start</div>
    {#each LANES as l (l.key)}<div class="lh lane-h">{l.label}<small>{l.repo}</small></div>{/each}
    {#each stages as s (s.key)}
      <div class="t tnum">{clock(s.started)}</div>
      {#each LANES as l (l.key)}
        <div class="cell" class:empty={l.key !== s.lane}>
          {#if l.key === s.lane}{@render card(s)}{/if}
        </div>
      {/each}
    {/each}
  </div>
  <div class="offchain">
    <span class="oh">Off-chain (cron)</span>
    {#each offChain as s (s.key)}{@render card(s)}{/each}
  </div>
</div>

<style>
  .card { background: var(--card); border: 1px solid var(--border); border-radius: var(--radius); overflow: hidden; }
  .lanes { display: grid; grid-template-columns: 4.5rem repeat(3, minmax(0, 1fr)); }
  .lh { font-size: 0.72rem; text-transform: uppercase; letter-spacing: 0.1em; color: var(--muted-foreground); font-weight: 600; padding: 0.6rem 0.75rem; border-bottom: 1px solid var(--border); }
  .lh small { display: block; text-transform: none; letter-spacing: 0; font-weight: 400; }
  .t { font-size: 0.75rem; color: var(--muted-foreground); padding: 0.55rem 0.75rem; border-top: 1px dashed var(--border); }
  .cell { padding: 0.4rem 0.5rem; border-top: 1px dashed var(--border); border-left: 1px solid var(--border); min-height: 3.2rem; }
  .cell.empty { background: repeating-linear-gradient(135deg, transparent 0 6px, color-mix(in oklch, var(--muted) 60%, transparent) 6px 7px); }
  .step { border: 1px solid var(--border); border-radius: 8px; padding: 0.4rem 0.55rem; background: var(--background); min-width: 0; }
  .step.ok { border-left: 3px solid var(--status-ok); }
  .step.warn { border-left: 3px solid var(--status-warn); background: color-mix(in oklch, var(--status-warn) 8%, var(--background)); }
  .step.fail { border-left: 3px solid var(--status-fail); }
  .step.running { border-left: 3px solid var(--muted-foreground); }
  .step.pending, .step.not_reached { border-style: dashed; opacity: 0.7; }
  .n { font-size: 0.85rem; font-weight: 600; display: flex; justify-content: space-between; gap: 0.5rem; }
  .n a { color: var(--muted-foreground); font-weight: 400; font-size: 0.72rem; text-decoration: none; }
  .d { font-size: 0.75rem; color: var(--muted-foreground); display: flex; gap: 0.5rem; flex-wrap: wrap; align-items: center; margin-top: 0.1rem; }
  .note { font-size: 0.75rem; margin-top: 0.3rem; }
  .lane-tag { display: none; font-size: 0.68rem; text-transform: uppercase; letter-spacing: 0.08em; }
  .offchain { padding: 0.6rem 0.75rem; border-top: 1px solid var(--border); display: flex; gap: var(--space-md); flex-wrap: wrap; background: var(--muted); }
  .offchain .step { flex: 1 1 14rem; }
  .oh { font-size: 0.72rem; text-transform: uppercase; letter-spacing: 0.1em; color: var(--muted-foreground); font-weight: 600; align-self: center; }
  .tnum { font-variant-numeric: tabular-nums; }
  @media (max-width: 760px) {
    .lanes { grid-template-columns: 3.6rem minmax(0, 1fr); }
    .lane-h { display: none; }
    .lh:first-child { grid-column: 1 / -1; }
    .cell.empty { display: none; }
    .lane-tag { display: inline; }
  }
</style>
