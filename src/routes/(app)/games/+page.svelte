<script lang="ts">
  /**
   * Explore — the workspace. Three regions, and the reading order is the job order:
   *
   *   rail (what's in the set) → count + chips (what I asked for) → shape (what the set
   *   looks like) → list (the games) → a row (one game).
   *
   * The Table|Summary lens is gone. Shape and games no longer take turns: the strip is a
   * permanent ~5rem band that both *shows* the set's distributions and *is* the control for
   * them, so nothing about the set is hidden behind a click and the rail sheds four number
   * inputs. Everything still runs against the in-browser DuckDB catalog — no server hop on
   * any interaction.
   */
  import { onMount } from 'svelte';
  import { afterNavigate } from '$app/navigation';
  import { initCatalog, query, catalog } from '$lib/catalog/catalog.svelte';
  import {
    DEFAULT_SCOPE,
    toWhere,
    universeWhere,
    scopeToParams,
    scopeFromParams,
    type Scope
  } from '$lib/catalog/scope';
  import Rail from '$lib/catalog/Rail.svelte';
  import FilterChips from '$lib/catalog/FilterChips.svelte';
  import ShapeStrip from '$lib/catalog/views/ShapeStrip.svelte';
  import GameList from '$lib/catalog/views/GameList.svelte';
  import GameCards from '$lib/catalog/views/GameCards.svelte';
  import AnalysisPanel from '$lib/catalog/AnalysisPanel.svelte';
  import { Container } from '$lib/components/ui/layout';

  let scope = $state<Scope>({ ...DEFAULT_SCOPE });
  let ready = $state(false);

  /**
   * PROTOTYPE toggle for item #3 (a trimmed-down Explore variant, option C — a card grid).
   * Local state, not persisted to the URL: this is a build-to-evaluate spike, not a shipped
   * mode, so it stays a one-line diff to remove if it's dropped after review.
   */
  let view = $state<'list' | 'cards'>('list');

  onMount(async () => {
    await initCatalog();
    ready = catalog.status === 'ready';
  });

  /**
   * Re-read `scope` from the URL on every navigation that lands here — not just the first.
   * `onMount` alone missed same-route navigations: clicking "Upcoming" in the header menu
   * while already on /games goes from `/games?...` to `/games?u=upcoming`, which SvelteKit
   * doesn't remount for (same route, querystring-only change), so `onMount` never re-fired
   * and the click did nothing visible. `afterNavigate` fires for that case too, and for the
   * first load, back/forward, and a pasted URL — the app's own scope→URL mirror below uses
   * raw `history.replaceState`, which doesn't trigger this, so there's no feedback loop.
   */
  afterNavigate(() => {
    scope = scopeFromParams(new URLSearchParams(location.search));
  });

  const where = $derived(ready ? toWhere(scope) : null);
  /** The universe with filters stripped — the strip's comparison population. */
  const baseWhere = $derived(ready ? universeWhere(scope) : null);

  // The one owner of the in-scope total, so the header and the list can't disagree.
  let total = $state<number | null>(null);
  let countToken = 0;
  $effect(() => {
    if (where == null) return;
    const w = where;
    const mine = ++countToken;
    query<{ n: number }>(`SELECT COUNT(*)::INT AS n FROM catalog WHERE ${w}`)
      .then((r) => mine === countToken && (total = r[0]?.n ?? 0))
      .catch((e) => console.error('count failed', e));
  });

  // The universe total, so the header can say "1,284 of 10,000" — a filter's effect is only
  // legible against what it started from.
  let universeTotal = $state<number | null>(null);
  let baseCountToken = 0;
  $effect(() => {
    if (baseWhere == null) return;
    const w = baseWhere;
    const mine = ++baseCountToken;
    query<{ n: number }>(`SELECT COUNT(*)::INT AS n FROM catalog WHERE ${w}`)
      .then((r) => mine === baseCountToken && (universeTotal = r[0]?.n ?? 0))
      .catch((e) => console.error('universe count failed', e));
  });

  /**
   * What the model had seen, shown only in the upcoming universe. A page of two-decimal model
   * numbers that never says what it was fitted on is quietly overclaiming, and
   * `training_cutoff_year` makes "these are all forecasts" checkable rather than asserted.
   * Carried over from the `/predictions` route, which was otherwise this page with the dial
   * pre-set and is now a menu row.
   */
  let cutoff = $state<number | null>(null);
  $effect(() => {
    if (!ready || scope.universe !== 'upcoming') {
      cutoff = null;
      return;
    }
    query<{ c: number | null }>(
      `SELECT MAX(training_cutoff_year)::INT AS c FROM catalog WHERE ${universeWhere(scope)}`
    )
      .then((r) => (cutoff = r[0]?.c ?? null))
      .catch((e) => console.error('cutoff query failed', e));
  });

  const universeLabel = $derived(
    scope.universe === 'top10k'
      ? 'the top 10,000'
      : scope.universe === 'rated'
        ? 'all rated games'
        : 'upcoming games'
  );
  const narrowed = $derived(total != null && universeTotal != null && total < universeTotal);

  // Mirror the scope to the URL (shareable, reload-safe) without a navigation. Also the
  // handoff to the detail page: `Back to results` there reads this querystring back.
  $effect(() => {
    if (!ready) return;
    const qs = scopeToParams(scope).toString();
    history.replaceState(history.state, '', qs ? `?${qs}` : location.pathname);
    try {
      sessionStorage.setItem('explore:qs', qs);
    } catch {
      // private-mode / storage-disabled: the back link just falls back to a bare /games
    }
  });
</script>

<svelte:head><title>Explore · bgg-viewer</title></svelte:head>

{#if catalog.status === 'error'}
  <p class="state err">Couldn’t load the catalog: {catalog.error}</p>
{:else if !ready}
  <div class="state">
    <span class="spin"></span>
    <p>Loading the catalog into your browser — this happens once.</p>
  </div>
{:else if where != null && baseWhere != null}
  <Container size="wide" fill>
    <div class="workspace">
      <Rail bind:scope {where} />

      <div class="canvas">
        <!-- Everything that was here before Analysis existed, sized to fill the canvas
             exactly as it always did — `height: 100%`, not a flex share, so Analysis
             (appended after, below) can never shrink it. See `.fixed-area` below. -->
        <div class="fixed-area">
          <div class="chead">
            <p class="count">
              <b class="tnum">{total?.toLocaleString() ?? '—'}</b>
              <span>{total === 1 ? 'game' : 'games'}</span>
              <span class="dim">
                {#if narrowed}
                  of <span class="tnum">{universeTotal?.toLocaleString()}</span>
                {:else}
                  in {universeLabel}
                {/if}
              </span>
            </p>
            <FilterChips bind:scope onclear={() => (scope = { ...DEFAULT_SCOPE, universe: scope.universe })} />

            <!-- PROTOTYPE — see `view` above. -->
            <span class="viewtoggle" role="group" aria-label="View">
              <button type="button" class:on={view === 'list'} onclick={() => (view = 'list')}>List</button>
              <button type="button" class:on={view === 'cards'} onclick={() => (view = 'cards')}>Cards</button>
            </span>
          </div>

          <ShapeStrip {where} {baseWhere} bind:scope />
          {#if view === 'cards'}
            <GameCards {where} universe={scope.universe} />
          {:else}
            <GameList {where} universe={scope.universe} />
          {/if}

          <!-- Provenance, not decoration. Every game in this universe was published after
               the model's training cutoff, so every number in the table is a forecast, not
               a fit. -->
          {#if scope.universe === 'upcoming'}
            <p class="prov">
              Model forecasts{#if cutoff}, from models fitted through <b>{cutoff}</b>{/if}. Every
              game here was announced after that, so none were in the training data.
            </p>
          {/if}
        </div>

        <AnalysisPanel {where} universe={scope.universe} bind:scope />
      </div>
    </div>
  </Container>
{/if}

<style>
  .state {
    display: flex;
    align-items: center;
    gap: 0.6rem;
    color: var(--muted-foreground);
  }
  .state p {
    margin: 0;
  }
  .state.err {
    color: var(--color-negative);
  }
  .spin {
    width: 0.9rem;
    height: 0.9rem;
    flex: none;
    border-radius: 50%;
    border: 2px solid color-mix(in oklch, var(--primary) 35%, var(--border));
    border-top-color: var(--primary);
    animation: spin 0.9s linear infinite;
  }
  @keyframes spin {
    to {
      transform: rotate(360deg);
    }
  }
  @media (prefers-reduced-motion: reduce) {
    .spin {
      animation: none;
    }
  }

  /* Two independently scrolling columns, each bounded by the shell's height — so a long
     facet list never pushes the games off the screen. */
  /* Width and fill-height belong to <Container size="wide" fill> — see layout/tokens.ts. */
  .workspace {
    display: grid;
    grid-template-columns: 16rem minmax(0, 1fr);
    gap: var(--space-lg);
    height: 100%;
    min-height: 0;
  }
  .canvas {
    display: flex;
    flex-direction: column;
    gap: var(--space-md);
    min-width: 0;
    min-height: 0;
    /* The list's column set responds to the canvas, not the viewport. */
    container-type: inline-size;
    /* .fixed-area always claims the canvas's full height (see below); Analysis, appended
       after it, is what makes the canvas's total content taller than its own box once
       open — this is what actually reveals it: scroll, not shrink anything above it. */
    overflow-y: auto;
  }
  /* Everything that rendered here before Analysis existed (chead, ShapeStrip, the table),
     now walled off in its own box sized to the FULL canvas height — a real `height: 100%`,
     not a flex share. That's the whole fix: a flex share is a number renegotiated every time
     a sibling (Analysis) appears or disappears, which is exactly what was shrinking the table
     down to fit whenever Analysis opened. A fixed 100% is deaf to Analysis entirely — the
     table sizes/shrinks-to-fit its rows exactly as it always did, and Analysis's extra height
     is pure overflow the canvas scrolls to reveal. */
  .fixed-area {
    flex: none;
    height: 100%;
    min-height: 0;
    display: flex;
    flex-direction: column;
    gap: var(--space-md);
  }

  .chead {
    display: flex;
    align-items: baseline;
    gap: var(--space-lg);
    flex-wrap: wrap;
  }
  .count {
    margin: 0;
    font-size: 0.9rem;
    white-space: nowrap;
  }
  .count b {
    font-size: 1.4rem;
    font-weight: 750;
    letter-spacing: -0.02em;
    margin-right: 0.15rem;
  }
  .count .dim {
    color: var(--muted-foreground);
  }
  .tnum {
    font-variant-numeric: tabular-nums;
  }

  /* PROTOTYPE (item #3) — plain toggle, no design pass; the point is to have something to
     click, not to be the final chrome. */
  .viewtoggle {
    display: inline-flex;
    gap: 0.2rem;
    margin-left: auto;
  }
  .viewtoggle button {
    background: var(--card);
    border: 1px solid var(--border);
    border-radius: 6px;
    color: var(--muted-foreground);
    cursor: pointer;
    font: inherit;
    font-size: 0.76rem;
    padding: 0.2rem 0.6rem;
  }
  .viewtoggle button.on {
    color: var(--primary);
    border-color: var(--primary);
  }

  .prov {
    margin: 0;
    flex: none;
    font-size: 0.74rem;
    color: var(--muted-foreground);
  }
  .prov b {
    color: var(--foreground);
    font-weight: 600;
  }

  /* Below the two-column threshold the workspace becomes an ordinary scrolling document —
     but the rail keeps its own bounded scroll there, or a stacked rail would push the games
     a screen and a half down the page. (A proper narrow layout wants the filters behind a
     drawer with the results first; this keeps them both in reach until that exists.) */
  @media (max-width: 900px) {
    .workspace {
      grid-template-columns: 1fr;
      height: auto;
    }
    .workspace :global(.rail) {
      max-height: 20rem;
      border: 1px solid var(--border);
      border-radius: var(--radius);
      padding: var(--space-md);
    }
  }
</style>
