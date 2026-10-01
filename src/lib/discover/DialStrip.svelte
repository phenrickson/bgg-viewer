<script lang="ts" module>
  import type { DialChip } from './DialRow.svelte';

  /** One question: its row id, the question itself, its answers, and how "no answer" reads
   *  in the collapsed summary ("any kind"). */
  export type DialQuestion = { id: string; question: string; chips: DialChip[]; any?: string };
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
   * `centered` centres each question and its chips.
   *
   * `collapsible` (with `stepwise`): once every question is answered the questions fold into
   * one line — the answers given in the text colour, the rest muted ("any kind") — with
   * "Change" to open them again and "Done" to fold them back. `answered` (bindable) is how many of the
   * four questions have an answer, "Doesn't matter" included — so a page can hold back its
   * actions until something's been asked.
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
    stepwise = false,
    centered = false,
    collapsible = false,
    answered: answeredCount = $bindable(0)
  }: {
    scope: Scope;
    onpatch: (patch: Partial<Scope>) => void;
    lead?: DialQuestion[];
    stepwise?: boolean;
    centered?: boolean;
    collapsible?: boolean;
    answered?: number;
  } = $props();

  const own: DialQuestion[] = $derived([
    {
      id: 'dial-cat',
      question: 'What kind of game?',
      any: 'any kind',
      chips: CATEGORY_CHIPS.map((c) => ({
        label: c.label,
        on: isCategoryOn(scope, c),
        onclick: () => onpatch(toggleCategory(scope, c))
      }))
    },
    {
      id: 'dial-players',
      question: 'How many players?',
      any: 'any player count',
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
      any: 'any weight',
      chips: COMPLEXITY_BANDS.map((b) => ({
        label: b.label,
        on: isBandOn(scope, b),
        onclick: () => onpatch(bandPatch(scope, b))
      }))
    },
    {
      id: 'dial-time',
      question: 'How long do you have?',
      any: 'any length',
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
      const skip = { label: 'Doesn’t matter', quiet: true, on: touched.has(q.id) && !picked(q), onclick: () => touch(q.id) };
      return { ...q, chips: [...chips, skip] };
    })
  );

  /** Up to and including the first unanswered question after the last answered one — so
   *  answers already in the URL show even when an earlier question hasn't been touched. */
  const shown = $derived.by(() => {
    if (!stepwise) return asked;
    const last = questions.findLastIndex((q) => answered(q));
    const next = questions.findIndex((q, i) => i > last && !answered(q));
    return next === -1 ? asked : asked.slice(0, next + 1);
  });

  $effect(() => {
    answeredCount = own.filter((q) => answered(q)).length;
  });

  // --- collapsed ---------------------------------------------------------------------------
  let editing = $state(false);
  const allAnswered = $derived(questions.every((q) => answered(q)));
  const collapsed = $derived(collapsible && stepwise && allAnswered && !editing);
  /** Each question's answer as the summary says it: the chosen labels, else its default or "any". */
  const summary = $derived(
    questions.map((q) => {
      const chosen = q.chips.filter((c) => c.on && !c.isDefault);
      if (chosen.length) return { id: q.id, text: chosen.map((c) => c.label).join(' or '), given: true };
      const dflt = q.chips.find((c) => c.on && c.isDefault);
      return { id: q.id, text: dflt?.label ?? q.any ?? 'any', given: false };
    })
  );
</script>

{#if collapsed}
  <p class="summary" class:centered>
    {#each summary as a, i (a.id)}
      {#if i}<span class="sep" aria-hidden="true">·</span>{/if}
      <span class:given={a.given}>{a.text}</span>
    {/each}
    <!-- PLACEHOLDER copy (Phil) -->
    <button type="button" class="link" onclick={() => (editing = true)}>Change</button>
  </p>
{:else}
  <div class="strip">
    {#each shown as q (q.id)}
      <div class:reveal={stepwise}>
        <DialRow id={q.id} question={q.question} chips={q.chips} {centered} />
      </div>
    {/each}
    {#if collapsible && editing && allAnswered}
      <!-- PLACEHOLDER copy (Phil) -->
      <div class:done-centered={centered}>
        <button type="button" class="link" onclick={() => (editing = false)}>Done</button>
      </div>
    {/if}
  </div>
{/if}

<style>
  .strip { display: flex; flex-direction: column; gap: var(--space-lg); }

  .summary {
    display: flex; flex-wrap: wrap; align-items: baseline; gap: 0.25rem 0.6rem;
    margin: 0; font-size: 1.05rem; color: var(--muted-foreground);
  }
  .summary.centered { justify-content: center; text-align: center; }
  .summary .given { color: var(--foreground); font-weight: 650; }
  .sep { color: color-mix(in oklch, var(--muted-foreground) 60%, transparent); }
  .link {
    font: inherit; font-weight: 600; cursor: pointer; padding: 0.1rem 0.3rem; margin-left: 0.3rem;
    background: none; border: none; border-radius: 6px; color: var(--primary);
  }
  .link:hover { background: color-mix(in oklch, var(--primary) 8%, transparent); }
  .link:focus-visible { outline: 2px solid var(--primary); outline-offset: 2px; }
  .done-centered { display: flex; justify-content: center; }
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
