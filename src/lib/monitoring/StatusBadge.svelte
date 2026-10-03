<script lang="ts">
  import type { StageStatusName } from '$lib/server/warehouse';
  import { STATUS_GLYPH, STATUS_TONE, STATUS_WORD } from './display';

  let { status, label }: { status: StageStatusName; label?: string } = $props();
</script>

<span class="st {STATUS_TONE[status]}" class:dashed={status === 'pending' || status === 'not_reached'}>
  <i aria-hidden="true">{STATUS_GLYPH[status]}</i>{label ?? STATUS_WORD[status]}
</span>

<style>
  .st { display: inline-flex; align-items: center; gap: 0.35rem; font-size: 0.78rem; font-weight: 600; white-space: nowrap; }
  .st i { font-style: normal; width: 1.1rem; height: 1.1rem; border-radius: 50%; display: inline-grid; place-items: center; font-size: 0.7rem; color: var(--card); }
  .ok { color: var(--status-ok); } .ok i { background: var(--status-ok); }
  .warn { color: color-mix(in oklch, var(--status-warn) 75%, var(--foreground)); }
  .warn i { background: var(--status-warn); color: oklch(0.25 0.02 260); }
  .fail { color: var(--status-fail); } .fail i { background: var(--status-fail); }
  .idle { color: var(--muted-foreground); }
  .idle i { background: transparent; border: 1.5px solid var(--muted-foreground); color: var(--muted-foreground); }
  .dashed i { border-style: dashed; }
</style>
