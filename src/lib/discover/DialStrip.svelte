<script lang="ts" module>
  import type { DialChip } from './DialRow.svelte';

  /** One question: its row id, the question itself, and its answers. */
  export type DialQuestion = { id: string; question: string; chips: DialChip[] };
</script>

<script lang="ts">
  /**
   * Discover's four questions. Deliberately chips, not a rail: the point is that every option
   * is visible at once and none of them is a text field, a slider, or a combo box. The visual
   * language is lifted from the landing page's "Try a query" chips so arriving from the front
   * door feels like the same room.
   *
   * Stateless about the scope — it renders the scope it is given and reports the patch for
   * what was clicked.
   *
   * `lead` puts extra questions first (Recommend's "Where from?").
   *
   * `stepwise` asks one question at a time: only the first shows, and answering it — any chip,
   * or "Doesn't matter" — brings in the next underneath. Earlier answers stay visible and
   * changeable. A question already answered in the URL counts as answered; a chip marked
   * `isDefault` (a pre-selected "Anywhere") doesn't. Off by default, so Discover shows all four.
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

  let {
    scope,
    onpatch,
    lead = [],
    stepwise = false
  }: {
    scope: Scope;
    onpatch: (patch: Partial<Scope>) => void;
    lead?: DialQuestion[];
    stepwise?: boolean;
  } = $props();

  const own: DialQuestion[] = $derived([
    {
      id: 'dial-cat',
      question: 'What kind of game?',
      chips: CATEGORY_CHIPS.map((c) => ({
        label: c.label,
        on: isCategoryOn(scope, c),
        onclick: () => onpatch(toggleCategory(scope, c))
      }))
    },
    {
      id: 'dial-players',
      question: 'How many players?',
      chips: PLAYER_CHIPS.map((p) => ({
        label: p.label,
        on: scope.bestAt === p.bestAt,
        ariaLabel: `Best at ${p.bestAt} players`,
        onclick: () => onpatch({ bestAt: scope.bestAt === p.bestAt ? null : p.bestAt })
      }))
    },
    {
      id: 'dial-weight',
      question: 'How complex?',
      chips: COMPLEXITY_BANDS.map((b) => ({
        label: b.label,
        on: isBandOn(scope, b),
        onclick: () => onpatch(bandPatch(scope, b))
      }))
    },
    {
      id: 'dial-time',
      question: 'How long do you have?',
      chips: PLAYTIME_CHIPS.map((t) => ({
        label: t.label,
        on: isPlaytimeOn(scope, t),
        onclick: () => onpatch(playtimePatch(scope, t))
      }))
    }
  ]);
  const questions = $derived([...lead, ...own]);

  // --- stepwise --------------------------------------------------------------------------
  /** Questions answered this visit — by any chip, or by "Doesn't matter". */
  let touched = $state<Set<string>>(new Set());
  const touch = (id: string) => {
    if (!touched.has(id)) touched = new Set([...touched, id]);
  };
  const picked = (q: DialQuestion) => q.chips.some((c) => c.on && !c.isDefault);
  const answered = (q: DialQuestion) => touched.has(q.id) || picked(q);

  /** Every question in stepwise mode records being answered, and offers "Doesn't matter". */
  const asked = $derived(
    questions.map((q): DialQuestion => {
      if (!stepwise) return q;
      const chips = q.chips.map((c) => ({ ...c, onclick: () => (touch(q.id), c.onclick()) }));
      // A question with a pre-selected default already has its "doesn't matter" answer.
      if (q.chips.some((c) => c.isDefault)) return { ...q, chips };
      // PLACEHOLDER copy (Phil)
      const skip = { label: 'Doesn’t matter', on: touched.has(q.id) && !picked(q), onclick: () => touch(q.id) };
      return { ...q, chips: [...chips, skip] };
    })
  );

  /** Up to and including the first question not yet answered. */
  const shown = $derived.by(() => {
    if (!stepwise) return asked;
    const next = questions.findIndex((q) => !answered(q));
    return next === -1 ? asked : asked.slice(0, next + 1);
  });
</script>

<div class="strip">
  {#each shown as q (q.id)}
    <div class:reveal={stepwise}>
      <DialRow id={q.id} question={q.question} chips={q.chips} />
    </div>
  {/each}
</div>

<style>
  .strip { display: flex; flex-direction: column; gap: var(--space-lg); }
  /* A newly asked question eases in under the last answer — motion that answers the click.
     None for anyone who asks for less motion. */
  .reveal { animation: dial-reveal 260ms ease-out both; }
  @keyframes dial-reveal {
    from { opacity: 0; transform: translateY(-4px); }
    to { opacity: 1; transform: none; }
  }
  @media (prefers-reduced-motion: reduce) {
    .reveal { animation: none; }
  }
</style>
