<script lang="ts">
  import type { PipelineVerdict } from '$lib/server/warehouse';
  import { clock, elapsed } from './display';

  let { verdict, now }: { verdict: PipelineVerdict; now: Date } = $props();

  const GLYPH = { ok: '✓', running: '◐', warn: '!', fail: '✕' } as const;
  const meta = $derived.by(() => {
    if (verdict.status === 'ok')
      return { label: 'Finished', value: `${clock(verdict.since)} UTC`, sub: `${verdict.duration_minutes}m end to end` };
    if (verdict.status === 'running') return { label: 'Started', value: `${clock(verdict.since)} UTC`, sub: '' };
    return { label: 'Stuck for', value: elapsed(verdict.since, now) || '—', sub: verdict.since ? `since ${clock(verdict.since)} UTC` : '' };
  });
</script>

<section class="verdict {verdict.status}" aria-live="polite">
  <div class="big" aria-hidden="true">{GLYPH[verdict.status]}</div>
  <div><h2>{verdict.headline}</h2></div>
  <div class="meta">{meta.label}<b class="tnum">{meta.value}</b>{meta.sub}</div>
</section>

<style>
  .verdict { display: grid; grid-template-columns: auto 1fr auto; gap: var(--space-lg); align-items: center; padding: var(--space-lg);
    background: var(--card); border: 1px solid var(--border); border-left: 4px solid var(--vc); border-radius: var(--radius); }
  .ok { --vc: var(--status-ok); } .warn { --vc: var(--status-warn); } .fail { --vc: var(--status-fail); } .running { --vc: var(--muted-foreground); }
  .big { width: 2.6rem; height: 2.6rem; border-radius: 50%; display: grid; place-items: center; font-weight: 700; font-size: 1.2rem; background: var(--vc); color: var(--card); }
  h2 { margin: 0; font-size: 1.15rem; letter-spacing: -0.01em; }
  .meta { text-align: right; font-size: 0.8rem; color: var(--muted-foreground); }
  .meta b { display: block; color: var(--foreground); font-size: 0.95rem; font-weight: 600; }
  .tnum { font-variant-numeric: tabular-nums; }
  @media (max-width: 640px) { .verdict { grid-template-columns: auto 1fr; } .meta { grid-column: 1 / -1; text-align: left; } }
</style>
