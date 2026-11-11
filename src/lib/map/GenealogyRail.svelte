<script lang="ts">
  /**
   * The tool's controls card, in `MapRail`'s idiom — the same `SegGroup` and the same
   * `.grp` / `.lbl` / `.note` rhythm — so the canvas tools' sidebars read as one thing.
   * The Genealogy / Network switch leads; beneath it, the controls of the view that's on.
   * The key isn't here: it stays on the canvas, always visible.
   *
   * Sliders show their value live while dragging and commit on release, since each value
   * is a rebuild and a URL write.
   *
   * All copy PLACEHOLDER (Phil writes the copy).
   */
  import SegGroup from '$lib/catalog/rail/SegGroup.svelte';
  import type { YMode } from './genealogy-layout';
  import { T_MIN, T_MAX, K_MIN, K_MAX, type GenealogyState, type View, type Hops, type Links } from './genealogy-url';

  let { s, oncommit }: { s: GenealogyState; oncommit: (next: GenealogyState) => void } = $props();

  /** Values under a slider's thumb while dragging; null when they match the committed ones. */
  let dragT = $state<number | null>(null);
  let dragK = $state<number | null>(null);
</script>

<div class="rail">
  <div class="grp top">
    <SegGroup
      ariaLabel="View"
      options={[{ value: 'tree' as View, label: 'Genealogy' }, { value: 'net' as View, label: 'Network' }]}
      value={s.view}
      onchange={(view) => oncommit({ ...s, view })}
    />
    <p class="note">
      {s.view === 'tree' ? 'Games like this one, laid out by when they came out.' : 'Games like this one, and which of them are like each other.'}
    </p>
  </div>

  {#if s.view === 'tree'}
    <div class="grp">
      <SegGroup
        label="Vertical axis"
        options={[{ value: 'year' as YMode, label: 'Year' }, { value: 'gen' as YMode, label: 'Generation' }]}
        value={s.y}
        onchange={(y) => oncommit({ ...s, y })}
      />
      <p class="note">{s.y === 'year' ? 'Rows by publication year, near years spread out.' : 'Rows by steps from the chosen game.'}</p>
    </div>

    <div class="grp">
      <label class="field">
        <span class="row"><span class="lbl">Similarity at least</span><b class="tnum">{(dragT ?? s.t).toFixed(2)}</b></span>
        <input
          type="range" min={T_MIN} max={T_MAX} step="0.01" value={s.t}
          oninput={(e) => (dragT = Number(e.currentTarget.value))}
          onchange={(e) => { const t = Number(e.currentTarget.value); dragT = null; oncommit({ ...s, t }); }}
        />
      </label>
      <p class="note">How alike two games must be to link. Higher keeps only the closest.</p>
    </div>

    <div class="grp">
      <SegGroup
        label="Same year"
        options={[{ value: 'show', label: 'Show' }, { value: 'hide', label: 'Hide' }]}
        value={s.same ? 'show' : 'hide'}
        onchange={(v) => oncommit({ ...s, same: v === 'show' })}
      />
      <p class="note">Games from the chosen game's own year, beside it.</p>
    </div>
  {:else}
    <div class="grp">
      <label class="field">
        <span class="row"><span class="lbl">Neighbours per game</span><b class="tnum">{dragK ?? s.k}</b></span>
        <input
          type="range" min={K_MIN} max={K_MAX} step="1" value={s.k}
          oninput={(e) => (dragK = Number(e.currentTarget.value))}
          onchange={(e) => { const k = Number(e.currentTarget.value); dragK = null; oncommit({ ...s, k }); }}
        />
      </label>
      <p class="note">How many of its most similar games each game links to.</p>
    </div>

    <div class="grp">
      <SegGroup
        label="Rings"
        options={[{ value: 1 as Hops, label: '1' }, { value: 2 as Hops, label: '2' }, { value: 3 as Hops, label: '3' }]}
        value={s.hops}
        onchange={(hops) => oncommit({ ...s, hops })}
      />
      <p class="note">1 is the game's own neighbours; 2 adds theirs; 3 one ring further.</p>
    </div>

    <div class="grp">
      <SegGroup
        label="Links"
        options={[{ value: 'mutual' as Links, label: 'Mutual' }, { value: 'all' as Links, label: 'All' }]}
        value={s.links}
        onchange={(links) => oncommit({ ...s, links })}
      />
      <!-- Placeholder copy (Phil writes copy). -->
      <p class="note">Every game keeps its link back to the chosen game. Mutual adds the links where both games list each other; All adds every one-way link too, dashed.</p>
    </div>
  {/if}
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
