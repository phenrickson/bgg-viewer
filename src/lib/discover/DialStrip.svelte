<script lang="ts">
  /**
   * Discover's four questions. Deliberately chips, not a rail: the point of this page is
   * that every option is visible at once and none of them is a text field, a slider, or a
   * combo box. The visual language is lifted from the landing page's "Try a query" chips so
   * arriving here from the front door feels like the same room.
   *
   * Stateless — it renders the scope it is given and reports the patch for what was clicked.
   */
  import type { Scope } from '$lib/catalog/scope';
  import {
    CATEGORY_CHIPS,
    PLAYER_CHIPS,
    COMPLEXITY_BANDS,
    toggleCategory,
    isCategoryOn,
    isBandOn,
    bandPatch,
    PLAYTIME_CHIPS,
    isPlaytimeOn,
    playtimePatch
  } from './dials';
  import DialRow from './DialRow.svelte';

  let { scope, onpatch }: { scope: Scope; onpatch: (patch: Partial<Scope>) => void } = $props();
</script>

<div class="strip">
  <DialRow
    id="dial-cat"
    question="What kind of game?"
    chips={CATEGORY_CHIPS.map((c) => ({
      label: c.label,
      on: isCategoryOn(scope, c),
      onclick: () => onpatch(toggleCategory(scope, c))
    }))}
  />
  <DialRow
    id="dial-players"
    question="How many players?"
    chips={PLAYER_CHIPS.map((p) => ({
      label: p.label,
      on: scope.bestAt === p.bestAt,
      ariaLabel: `Best at ${p.bestAt} players`,
      onclick: () => onpatch({ bestAt: scope.bestAt === p.bestAt ? null : p.bestAt })
    }))}
  />
  <DialRow
    id="dial-weight"
    question="How complex?"
    chips={COMPLEXITY_BANDS.map((b) => ({
      label: b.label,
      on: isBandOn(scope, b),
      onclick: () => onpatch(bandPatch(scope, b))
    }))}
  />
  <DialRow
    id="dial-time"
    question="How long do you have?"
    chips={PLAYTIME_CHIPS.map((t) => ({
      label: t.label,
      on: isPlaytimeOn(scope, t),
      onclick: () => onpatch(playtimePatch(scope, t))
    }))}
  />
</div>

<style>
  .strip { display: flex; flex-direction: column; gap: var(--space-lg); }
</style>
