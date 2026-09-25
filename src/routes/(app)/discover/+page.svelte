<script lang="ts">
  /**
   * Discover — the step between the front door and the workshop.
   *
   * Explore can answer anything but shows you a rail of twelve controls to do it. Discover
   * asks four coarse questions and hands back a readable list. It is the same `Scope`
   * underneath, which is why "see all N in Explore" is a link and not a translation: the
   * user carries their question into the bigger room instead of restating it.
   *
   * The questions are `DialStrip` and the list is `DiscoverResults` — the same two pieces
   * Recommend's "Help me find a game" is built from.
   *
   * Copy is PLACEHOLDER — Phil writes the final strings.
   */
  import { onMount } from 'svelte';
  import { afterNavigate, replaceState } from '$app/navigation';
  import { initCatalog } from '$lib/catalog/catalog.svelte';
  import { DEFAULT_SCOPE, scopeToParams, type Scope } from '$lib/catalog/scope';
  import DialStrip from '$lib/discover/DialStrip.svelte';
  import DiscoverResults from '$lib/discover/DiscoverResults.svelte';
  import { discoverScopeFromParams } from '$lib/discover/dials';
  import { Container } from '$lib/components/ui/layout';

  /**
   * Discover defaults to the whole rated population rather than the top-10k slice, so that
   * with nothing selected the page reads as "top rated, all-time" — the same promise the
   * landing page's chip of that name makes.
   */
  const DISCOVER_DEFAULT: Scope = { ...DEFAULT_SCOPE, universe: 'rated' };

  let scope = $state<Scope>(DISCOVER_DEFAULT);

  onMount(() => {
    initCatalog();
  });

  /**
   * Re-read `scope` from the URL on every navigation that lands here, not just the first —
   * see the identical fix and full reasoning on Explore's /games page. `patch()` below mirrors
   * scope to the URL via SvelteKit's `replaceState`, which is explicitly shallow and does not
   * trigger `afterNavigate`, so there's no feedback loop.
   */
  afterNavigate(() => {
    scope = discoverScopeFromParams(new URLSearchParams(location.search));
  });

  /** Apply a dial's patch: update state, then mirror it into the URL. */
  function patch(p: Partial<Scope>) {
    scope = { ...scope, ...p };
    const qs = scopeToParams(scope).toString();
    replaceState(qs ? `?${qs}` : location.pathname, {});
  }
</script>

<svelte:head><title>Discover · bgg-viewer</title></svelte:head>

<!-- ONE measure, so everything shares a left edge.
     An earlier pass put the hero in `prose` and the list in a wider container, meaning to
     make the results "step out". With a short headline above a full-width card the two
     margins just read as misalignment — the page wobbled instead of stepping. The landing
     page is calm precisely because every element starts at the same x. -->
<div class="page">
  <Container size="list">
    <!-- PLACEHOLDER copy -->
    <h1>Find your next <em>game night</em>.</h1>
    <p class="lede">Answer as few or as many as you like — the list below narrows as you go.</p>

    <DialStrip {scope} onpatch={patch} />

    <div class="answer">
      <DiscoverResults {scope} onpatch={patch} />
    </div>
  </Container>
</div>

<style>
  /* Content-driven, not fill-height. Bounding the list to DISCOVER_LIMIT rows made the
     internal scroll pointless — 25 rows is content, so the page just flows and the document
     scrolls, which is also what lets the door at the foot be reached by scrolling to the end
     rather than hiding below a nested scroller. */
  .page {
    display: flex; flex-direction: column;
    /* No top padding: the app shell's `.content` already pads every page, and adding a
       viewport-scaled clamp on top of it stacked to ~4.5rem of nothing above the headline on
       a wide window. Bottom padding stays, so the last element isn't flush to the scroll end. */
    gap: var(--space-xl); padding: 0 0 var(--space-xl);
  }

  /* Matches the landing page's hero, so the two pages read as one voice. */
  h1 {
    font-size: var(--text-display, clamp(1.8rem, 1.1rem + 3vw, 3rem));
    font-weight: 750; letter-spacing: -0.03em; line-height: 1.05;
    margin: 0; text-wrap: balance;
  }
  h1 em { font-style: normal; color: var(--primary); }
  .lede {
    font-size: 1.1rem; color: var(--muted-foreground); max-width: 40rem;
    /* Sits under its own headline (0.6rem), then a full gap before the questions begin, so
       the hero reads as one block rather than as the first item in a flat list. */
    margin: 0.6rem 0 var(--space-xl);
  }

  /* The answer, set apart from the questions — the same break the page always had. */
  .answer { margin-top: var(--space-xl); }
</style>
