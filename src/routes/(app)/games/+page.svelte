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
  import { browser } from '$app/environment';
  import {
    initCatalog,
    query,
    catalog,
    appendCollectionFilter,
    clearCollectionFilter
  } from '$lib/catalog/catalog.svelte';
  import {
    DEFAULT_SCOPE,
    toWhere,
    universeWhere,
    scopeToParams,
    scopeFromParams,
    activeFilters,
    type Scope
  } from '$lib/catalog/scope';
  import Rail from '$lib/catalog/Rail.svelte';
  import FilterChips from '$lib/catalog/FilterChips.svelte';
  import ShapeStrip from '$lib/catalog/views/ShapeStrip.svelte';
  import GameList from '$lib/catalog/views/GameList.svelte';
  import AnalysisPanel from '$lib/catalog/AnalysisPanel.svelte';
  import AdminCollectionPicker from '$lib/catalog/AdminCollectionPicker.svelte';
  import { Container } from '$lib/components/ui/layout';
  import * as Sheet from '$lib/components/ui/sheet';
  import { Button } from '$lib/components/ui/button';
  import type { PageData } from './$types';

  let { data }: { data: PageData } = $props();

  /**
   * Seed the scope from the URL *synchronously*, at component creation — not from a later
   * `afterNavigate`. Coming back from a game (browser back, or "Back to results") the
   * catalog is already warm, so `ready` flips almost immediately and the scope→URL mirror
   * effect below could run before `afterNavigate` had a chance to parse the querystring —
   * writing an empty scope back as `/games` and wiping the filters. Seeding here means the
   * mirror's first write re-emits the same querystring it was seeded from, so there's
   * nothing to clobber. (`ssr = false` for this route, so `browser` is always true; the
   * fallback is only for type-safety.)
   */
  let scope = $state<Scope>(
    browser ? scopeFromParams(new URLSearchParams(location.search)) : { ...DEFAULT_SCOPE }
  );
  let ready = $state(false);
  /**
   * Belt-and-suspenders for the mirror effect: never write the URL until the scope has been
   * read from it at least once. True from the start on the client (seeded above); only
   * meaningful if SSR is ever re-enabled for this route.
   */
  let hydrated = $state(browser);

  /**
   * List/Visualize — a swap, not a panel appended below the table: Visualize occupies the
   * same bounded slot GameList does, rather than competing with it for space as a sibling
   * (which read as Visualize growing up and covering the table). Local state, not persisted
   * to the URL.
   *
   * The card-grid variant (item #3's option C) that used to share this toggle is dropped for
   * now — GameCards.svelte still exists, just unwired, in case it's worth revisiting later.
   */
  let view = $state<'list' | 'visualize'>('list');

  /**
   * Below 40rem the workspace stops being a workspace.
   *
   * First attempt put the WHOLE rail — including the shape strip — behind a "Filters" button,
   * one flat pile of controls with a single exit. Two things were wrong with that, not one:
   *
   *   1. Universe (Top 10k / All rated / Upcoming) is the single most-reached-for control —
   *      Rail's own header comment says so, "always open," the thing you touch before anything
   *      else — and it was buried a tap deep with everything else. It belongs where you can
   *      always reach it, not inside a drawer.
   *   2. The shape strip isn't a filter, it's a chart — "drag a chart to filter" was never
   *      going to work with a thumb, and it doesn't belong beside checkboxes just because it
   *      technically narrows the set too. It already has a real home: List/Visualize.
   *
   * So narrow gets a small persistent toolbar (Universe + a Filters trigger, count visible),
   * and the sheet holds only what's actually a filter: search, player count, the collapsed
   * facet groups, complexity. The strip stays exactly where desktop already puts it — behind
   * Visualize — rather than getting a second, narrower copy of itself.
   *
   * `matchMedia` rather than CSS because Rail has to be the SAME component instance whether
   * it's inline (desktop) or in the sheet (narrow) — rendering it twice would double every
   * facet query against DuckDB. Same technique ShapeStrip already uses for its own switch.
   */
  let narrow = $state(false);
  $effect(() => {
    const mq = window.matchMedia('(max-width: 40rem)');
    const sync = () => (narrow = mq.matches);
    sync();
    mq.addEventListener('change', sync);
    return () => mq.removeEventListener('change', sync);
  });

  /** `Sheet.Root`'s own open state — bits-ui owns the focus trap, Escape and the inert
      background; this file just needs to know whether it's open. */
  let filtersOpen = $state(false);

  /** The count on the trigger — filters must stay legible while they're out of sight. */
  const activeCount = $derived(activeFilters(scope).length + (catalog.collectionUsername ? 1 : 0));

  // Leaving narrow with the sheet open would strand a modal over a desktop layout.
  $effect(() => {
    if (!narrow) filtersOpen = false;
  });

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
    hydrated = true;
  });

  const where = $derived(ready ? appendCollectionFilter(toWhere(scope)) : null);
  /** The universe with filters stripped — the strip's comparison population. Also scoped to the
      admin collection filter, so the shape strip compares within the collection, not the whole
      catalog, once a collection is applied. */
  const baseWhere = $derived(ready ? appendCollectionFilter(universeWhere(scope)) : null);

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

  const universeLabel = $derived(scope.universe === 'rated' ? 'all rated games' : 'upcoming games');
  const narrowed = $derived(total != null && universeTotal != null && total < universeTotal);

  // Mirror the scope to the URL (shareable, reload-safe) without a navigation. Also the
  // handoff to the detail page: `Back to results` there reads this querystring back.
  $effect(() => {
    if (!ready || !hydrated) return;
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
    {#if narrow}
      <!--
        Filters, alone, and nothing else on this row.
        It used to lead with three Universe buttons — the mobile answer to "Universe is the
        first thing you touch, so don't bury it behind a button". That premise was wrong:
        Universe was conflating a data mode (upcoming, where every number is a prediction)
        with a popularity filter (top 10,000, a subset of rated), and neither belongs at the
        top of a phone screen ahead of the games. Upcoming is a nav destination now; ranked
        top-10,000 is a toggle inside the sheet like every other filter. What's left is one
        trigger with a live count of what's applied, and a row of games starting higher up.
      -->
      <div class="flex items-center gap-2 pb-3">
        <Sheet.Root bind:open={filtersOpen}>
          <Sheet.Trigger>
            {#snippet child({ props })}
              <Button {...props} variant="outline" size="sm" class="relative w-full">
                Filters
                {#if activeCount}
                  <span
                    class="ml-1 inline-flex h-4 min-w-4 items-center justify-center rounded-full bg-primary px-1 text-[10px] font-bold text-primary-foreground"
                    >{activeCount}</span
                  >
                {/if}
              </Button>
            {/snippet}
          </Sheet.Trigger>
          <!-- Bottom, not the skill's default `side="right"`: a slide-over reads as a secondary
               panel beside content (its documented use — record CRUD), where this needs to read
               as its own screen you've deliberately entered to filter, the way Filters behaves
               in most mobile apps. Left short of full height on purpose — 92dvh, not 100 — so a
               sliver of the page stays visible behind it; a totally opaque takeover is what
               made the first version feel like leaving the app rather than adjusting a query. -->
          <Sheet.Content side="bottom" class="flex h-[92dvh] max-h-[92dvh] flex-col p-0">
            <Sheet.Header class="border-b border-border">
              <Sheet.Title>Filters</Sheet.Title>
            </Sheet.Header>

            <!-- Fill-height Pattern A from the layout skill: header at natural height, this
                 region takes what's left and owns its own scroll. No shape strip here — see
                 the narrow-mode comment above; it isn't a filter, Visualize already covers it. -->
            <div class="sheet-scroll min-h-0 flex-1 overflow-y-auto p-4">
              <Rail bind:scope {where} bggUsername={data.user?.bgg_username ?? null} />
              {#if data.isAdmin}<AdminCollectionPicker />{/if}
            </div>

            <!-- The live reward loop a desktop workspace gets for free: the count updates as
                 you check a box, right on the button that gets you back to seeing it. Replaces
                 the first version's plain "Done" — a label you had to go find beats nothing,
                 but a number that moves is what makes filtering feel connected to results. -->
            <Sheet.Footer class="border-t border-border">
              <Button size="lg" class="w-full" onclick={() => (filtersOpen = false)}>
                Show {total?.toLocaleString() ?? '…'} games
              </Button>
            </Sheet.Footer>
          </Sheet.Content>
        </Sheet.Root>
      </div>
    {/if}

    <div class="workspace" class:narrow>
      {#if !narrow}
        <div class="sidebar">
          <Rail bind:scope {where} bggUsername={data.user?.bgg_username ?? null} />
          {#if data.isAdmin}<AdminCollectionPicker />{/if}
        </div>
      {/if}

      <div class="canvas">
        <div class="chead">
          <p class="count">
            <b class="tnum">{total?.toLocaleString() ?? '—'}</b>
            <span>{total === 1 ? 'game' : 'games'}</span>
            <span class="dim">
              {#if narrowed}
                of <span class="tnum">{universeTotal?.toLocaleString()}</span>
              {:else}
                <!-- On narrow the toolbar's own Universe button is already lit to say this;
                     `.unilabel` lets CSS drop just this branch there, not the `narrowed` one
                     above, which is real information ("of X") the toolbar can't show. -->
                <span class="unilabel">in {universeLabel}</span>
              {/if}
            </span>
          </p>
          <FilterChips
            bind:scope
            extra={catalog.collectionUsername
              ? [
                  {
                    id: 'collection',
                    kind: 'Collection',
                    label: catalog.collectionUsername,
                    onclear: clearCollectionFilter
                  }
                ]
              : []}
            onclear={() => {
              scope = { ...DEFAULT_SCOPE, universe: scope.universe };
              clearCollectionFilter();
            }}
          />

          <span class="viewtoggle" role="group" aria-label="View">
            <button type="button" class:on={view === 'list'} onclick={() => (view = 'list')}>List</button>
            <button type="button" class:on={view === 'visualize'} onclick={() => (view = 'visualize')}
              >Visualize</button
            >
          </span>
        </div>

        {#if !narrow}
          <ShapeStrip {where} {baseWhere} bind:scope />
        {/if}
        {#if view === 'visualize'}
          <AnalysisPanel {where} {baseWhere} universe={scope.universe} bind:scope />
        {:else}
          <GameList {where} universe={scope.universe} />
        {/if}

        <!-- Provenance, not decoration. Every game in this universe was published after the
             model's training cutoff, so every number in the table is a forecast, not a fit. -->
        {#if scope.universe === 'upcoming'}
          <p class="prov">
            Model forecasts{#if cutoff}, from models fitted through <b>{cutoff}</b>{/if}. Every
            game here was announced after that, so none were in the training data.
          </p>
        {/if}
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
  /* Holds the rail plus the admin-only collection picker below it. The rail keeps its own
     scroll region (`:global(.rail)`'s overflow-y); the picker stays fixed at the bottom rather
     than scrolling with a long facet list. */
  .sidebar {
    display: flex;
    flex-direction: column;
    min-height: 0;
  }
  .sidebar :global(.rail) {
    flex: 1 1 auto;
  }
  .canvas {
    display: flex;
    flex-direction: column;
    gap: var(--space-md);
    min-width: 0;
    min-height: 0;
    /* The list's column set responds to the canvas, not the viewport. */
    container-type: inline-size;
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
  /* Matches Rail's Universe segmented control (`.seg`/`.seg button`) — the same visual
     language for "pick one of a few states," sized up from the original plain-text version.
     Lives in .chead's corner (not its own row — that cost a full extra line of vertical
     space the canvas can't spare). */
  .viewtoggle {
    flex: none;
    display: inline-flex;
    gap: 0.3rem;
    margin-left: auto;
  }
  .viewtoggle button {
    border: 1px solid var(--border);
    border-radius: 6px;
    background: var(--card);
    color: var(--muted-foreground);
    cursor: pointer;
    font: inherit;
    font-size: 0.85rem;
    font-weight: 550;
    padding: 0.4rem 1rem;
  }
  .viewtoggle button:hover {
    color: var(--foreground);
  }
  .viewtoggle button.on {
    border-color: var(--primary);
    color: var(--primary);
    background: color-mix(in oklch, var(--primary) 10%, transparent);
    font-weight: 650;
  }
  .viewtoggle button:focus-visible {
    outline: 2px solid var(--primary);
    outline-offset: 1px;
  }
  /* Touch sizing: padding AND type together, not min-height alone. Raising only the height
     gave tall boxes with tiny text floating in them — a desktop control in a bigger box.
     A touch control should look touch-sized. Desktop density is left alone. */
  @media (max-width: 40rem) {
    .viewtoggle button { padding: 0.65rem 1.1rem; font-size: 0.9rem; }

    /* The toolbar's own Universe button is already lit to say "All rated" — this said the
       same thing a second time, and made `.count` long enough that List/Visualize had
       nowhere to go but its own wrapped line, `margin-left: auto` pulling it to the right
       edge with dead space in front of it. Dropping the redundant phrase is what lets
       count + view toggle actually share the row they're meant to. */
    .unilabel { display: none; }

    /*
     * Two explicit rows instead of one wrapping one.
     *
     * `.chead` is a `flex-wrap` row of [count] [chips] [view toggle], with the toggle pushed
     * right by `margin-left: auto`. That holds while there are no filters. Add one chip and
     * the row overflows: the toggle wraps to a line of its own, still `auto`-pushed, so it
     * sits alone at the right edge with a band of empty space beside it — and the chips, which
     * are the thing that just changed, end up sandwiched between the count and that gap. The
     * layout was reporting the wrap, not the structure.
     *
     * The structure is: one row that says what you are looking at and how, and one row that
     * says what you did to it. A grid states that outright, so adding a filter grows the
     * header downward in a predictable place instead of rearranging what was already there.
     */
    .chead {
      display: grid;
      grid-template-columns: 1fr auto;
      align-items: center;
      row-gap: var(--space-sm);
      column-gap: var(--space-sm);
    }
    .count { grid-column: 1; }
    .viewtoggle { grid-column: 2; margin-left: 0; }
    /* FilterChips owns its own root; from out here it's the child that has to span. */
    .chead > :global(.chips) { grid-column: 1 / -1; }
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

  /* Between the two-column threshold and the sheet: an ordinary scrolling document, with the
     rail keeping its own bounded scroll so a stacked rail doesn't push the games a screen and
     a half down. Below 40rem this stops applying — `.narrow` drops the rail entirely. */
  @media (max-width: 900px) {
    .workspace:not(.narrow) {
      grid-template-columns: 1fr;
      height: auto;
    }
    .workspace:not(.narrow) :global(.rail) {
      max-height: 20rem;
      border: 1px solid var(--border);
      border-radius: var(--radius);
      padding: var(--space-md);
    }
  }

  /* One column, one scroll direction, results first. */
  .workspace.narrow { grid-template-columns: 1fr; }

  /* Sheet.Content owns the scroll region now, not a hand-rolled `.sheetbody` — but Rail still
     carries its own `.rail { overflow-y: auto }` for its desktop bounded-scroll use, and
     nesting one scroll container inside another was exactly the "which way does a swipe go"
     bug from the first version. Same fix, new host: the sheet's own scroll region wins. */
  .sheet-scroll { display: flex; flex-direction: column; gap: var(--space-md); }
  .sheet-scroll :global(.rail) { overflow-y: visible; }
</style>
