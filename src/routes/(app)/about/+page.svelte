<script lang="ts">
  /**
   * About — what the numbers mean, how they relate, and what happens for games that don't
   * have them yet.
   *
   * The arc is deliberate and runs in one direction:
   *
   *   1. a PRIMER on each measure on its own (rating, complexity, player-count votes),
   *   2. the RELATIONSHIPS between them, which is where the interesting claims live —
   *      whether heavier games really score better, and how popularity and rating interact,
   *   3. what the site does about games too new to have any of it: MODELS.
   *
   * This material started life on Discover, where it was wrong: that page's job is to answer
   * a question about a set of games, not to teach BGG's methodology. Here it has a page of
   * its own, and Discover keeps only what is scoped to the user's own selection.
   *
   * COPY IS PLACEHOLDER — Phil writes the prose. Structure, queries and charts are real.
   */
  import { onMount } from 'svelte';
  import { initCatalog, catalog, query } from '$lib/catalog/catalog.svelte';
  import { DEFAULT_SCOPE, toWhere } from '$lib/catalog/scope';
  import { scatterSql, popularityRatingGeekSql } from '$lib/catalog/aggregates';
  import { Container } from '$lib/components/ui/layout';
  import HowItWorks from '$lib/about/HowItWorks.svelte';
  import Scatter from '$lib/charts/Scatter.svelte';

  onMount(() => {
    initCatalog();
  });

  type Pt = { x: number; y: number; c?: number };

  /** The whole rated population — these plots describe the catalog, not any one query. */
  const ALL = toWhere({ ...DEFAULT_SCOPE, universe: 'rated' });

  let weightRating = $state<Pt[]>([]);
  let popRating = $state<Pt[]>([]);

  $effect(() => {
    if (catalog.status !== 'ready') return;
    Promise.all([
      query<Pt>(scatterSql(ALL)),
      query<Pt>(popularityRatingGeekSql(ALL))
    ])
      .then(([a, b]) => {
        weightRating = a;
        popRating = b;
      })
      .catch((e) => console.error('about scatter query failed', e));
  });
</script>

<svelte:head><title>About the data · bgg-viewer</title></svelte:head>

<div class="page">
  <Container size="list">
    <!-- PLACEHOLDER copy -->
    <h1>About this <em>data</em>.</h1>
    <p class="lede">[Intro — where the data comes from, how often it refreshes, and what this
      page is for.]</p>

    {#if catalog.status === 'error'}
      <p class="msg">
        Couldn’t load the catalog.
        <button type="button" class="retry" onclick={() => initCatalog()}>Try again</button>
      </p>
    {:else if catalog.status !== 'ready'}
      <p class="msg">Warming the catalog…</p>
    {:else}
      <!-- 1. The primer: each measure on its own. -->
      <HowItWorks />

      <!-- 2. How they relate. -->
      <section class="sec">
        <h2>How the numbers relate</h2>
        <!-- PLACEHOLDER -->
        <p class="lede">[Each measure above is interesting on its own; the relationships
          between them are where the arguments are.]</p>

        <div class="figure">
          <h3>Does heavier mean better?</h3>
          <!-- PLACEHOLDER -->
          <p>[Complexity on the x-axis, average rating on the y. Say what the cloud shows —
            and the caveat that the people who rate heavy games are the people who sought them
            out.]</p>
          <Scatter
            points={weightRating}
            xLabel="Complexity (1–5)"
            yLabel="Average rating"
            xTicks={[1, 2, 3, 4, 5]}
            yTicks={[2, 4, 6, 8, 10]}
            height={320}
          />
        </div>

        <div class="figure">
          <h3>Popularity and rating</h3>
          <!-- PLACEHOLDER -->
          <p>[Number of ratings on a log x-axis, average rating on the y, coloured by geek
            rating. This is the plot that makes the Bayesian adjustment visible: the
            high-average games on the left have almost no votes, and their geek rating drags
            them back toward the middle.]</p>
          <Scatter
            points={popRating}
            xLabel="People who rated it (log scale)"
            yLabel="Average rating"
            xLog
            colorLabel="Geek rating"
            xTicks={[30, 100, 1000, 10000, 100000]}
            yTicks={[2, 4, 6, 8, 10]}
            height={320}
          />
        </div>
      </section>

      <!-- 3. What happens when a game has none of this yet. -->
      <section class="sec">
        <h2>Games that don’t have numbers yet</h2>
        <!-- PLACEHOLDER -->
        <p class="lede">[A game announced last month has no ratings, no weight votes and no
          geek rating — the “—” you'll see on new releases. That is the interesting case, and
          the reason for the models.]</p>

        <div class="prose">
          <!-- PLACEHOLDER -->
          <p>[What the models predict: whether a game will clear the ratings threshold at all
            (the hurdle), and then its geek rating, average rating, complexity, and how many
            people will rate it.]</p>
          <p>[How they are trained and how far back the cutoff sits — and the honest caveat
            that a prediction for a game already in the training data is not a forecast, which
            is what `sample_status` records.]</p>
          <p>[Where to see them: the prediction panel on any game page, and the upcoming
            predictions view when it lands.]</p>
        </div>
      </section>
    {/if}
  </Container>
</div>

<style>
  .page {
    display: flex; flex-direction: column;
    gap: var(--space-xl); padding: clamp(1.5rem, 4vw, 3rem) 0 var(--space-xl);
  }

  h1 {
    font-size: var(--text-display, clamp(1.8rem, 1.1rem + 3vw, 3rem));
    font-weight: 750; letter-spacing: -0.03em; line-height: 1.05;
    margin: 0; text-wrap: balance;
  }
  h1 em { font-style: normal; color: var(--primary); }
  .lede {
    font-size: 1.1rem; color: var(--muted-foreground); max-width: 42rem;
    margin: 0.6rem 0 var(--space-xl);
  }

  .sec { display: flex; flex-direction: column; gap: var(--space-md); }
  .sec > .lede { font-size: 1rem; margin: 0 0 var(--space-sm); }
  h2 {
    font-size: var(--text-heading, clamp(1.3rem, 1rem + 1.2vw, 1.9rem));
    font-weight: 700; letter-spacing: -0.02em; margin: 0; color: var(--foreground);
  }
  h3 {
    font-size: 1.05rem; font-weight: 600; letter-spacing: -0.01em; margin: 0;
    color: var(--foreground);
  }

  .figure { display: flex; flex-direction: column; gap: 0.5rem; }
  .figure p, .prose p {
    margin: 0; font-size: 0.92rem; line-height: 1.55; color: var(--muted-foreground);
    max-width: 42rem;
  }
  .prose { display: flex; flex-direction: column; gap: 0.7rem; }

  .msg { color: var(--muted-foreground); font-size: 0.9rem; }
  .retry {
    font: inherit; margin-left: 0.4rem; cursor: pointer;
    background: none; border: none; color: var(--primary); text-decoration: underline;
  }
</style>
