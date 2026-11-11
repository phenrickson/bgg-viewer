<script lang="ts">
  /**
   * The genealogy's sidebar panels, in `MapRail`'s idiom — the same `SegGroup` and the same
   * `.grp` / `.lbl` / `.note` rhythm — so the two canvas tools' sidebars read as one thing.
   * The key isn't here: it stays on the canvas, always visible.
   *
   * The similarity readout follows the slider as it moves; the tree only rebuilds on release
   * (`onthreshold`), since each value is a fresh scan and a URL write.
   *
   * All copy PLACEHOLDER (Phil writes the copy).
   */
  import SegGroup from '$lib/catalog/rail/SegGroup.svelte';
  import type { YMode } from './genealogy-layout';

  let {
    y = 'year',
    same = true,
    threshold = 0.9,
    min = 0.5,
    max = 0.99,
    onaxis,
    onsame,
    onthreshold
  }: {
    y?: YMode;
    same?: boolean;
    threshold?: number;
    min?: number;
    max?: number;
    onaxis?: (y: YMode) => void;
    onsame?: (same: boolean) => void;
    onthreshold?: (t: number) => void;
  } = $props();

  /** The value under the thumb while dragging; null when it matches the committed one. */
  let dragging = $state<number | null>(null);
  const shown = $derived(dragging ?? threshold);
</script>

<div class="rail">
    <div class="grp top">
      <SegGroup
        label="Vertical axis"
        options={[{ value: 'year' as YMode, label: 'Year' }, { value: 'gen' as YMode, label: 'Generation' }]}
        value={y}
        onchange={(v) => onaxis?.(v)}
      />
      <p class="note">{y === 'year' ? 'Rows by publication year, near years spread out.' : 'Rows by steps from the chosen game.'}</p>
    </div>

    <div class="grp">
      <label class="field">
        <span class="row"><span class="lbl">Similarity at least</span><b class="tnum">{shown.toFixed(2)}</b></span>
        <input
          type="range" {min} {max} step="0.01" value={threshold}
          oninput={(e) => (dragging = Number(e.currentTarget.value))}
          onchange={(e) => { const t = Number(e.currentTarget.value); dragging = null; onthreshold?.(t); }}
        />
      </label>
      <p class="note">How alike two games must be to link. Higher keeps only the closest.</p>
    </div>

    <div class="grp">
      <SegGroup
        label="Same year"
        options={[{ value: 'show', label: 'Show' }, { value: 'hide', label: 'Hide' }]}
        value={same ? 'show' : 'hide'}
        onchange={(v) => onsame?.(v === 'show')}
      />
      <p class="note">Games from the chosen game's own year, beside it.</p>
    </div>
</div>

<style>
  /* MapRail's rhythm: no card chrome, section rules carry the structure. */
  .rail { font-size: 0.85rem; }
  .grp { display: flex; flex-direction: column; gap: 0.35rem; padding: 0.6rem 0; border-top: 1px solid var(--border); }
  .grp.top { border-top: none; }
  .lbl { font-size: 0.72rem; text-transform: uppercase; letter-spacing: 0.05em; color: var(--muted-foreground); font-weight: 600; }
  .note { margin: 0; font-size: 0.7rem; color: var(--muted-foreground); line-height: 1.35; }
  .field { display: flex; flex-direction: column; gap: 0.35rem; }
  .row { display: flex; align-items: baseline; justify-content: space-between; }
  .field input[type='range'] { width: 100%; min-width: 0; }
  .tnum { font-variant-numeric: tabular-nums; }
</style>
