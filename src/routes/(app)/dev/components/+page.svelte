<script lang="ts">
  /**
   * `/dev/components` — the shared game components on real catalog games, in each size and
   * state. Local only (see `+page.server.ts`). Toggle the theme in the header to check dark.
   */
  import { initCatalog, catalog, query } from '$lib/catalog/catalog.svelte';
  import { Container, Stack, AutoGrid } from '$lib/components/ui/layout';
  import { Button } from '$lib/components/ui/button';
  import { SegmentedControl } from '$lib/components/ui/segmented-control';
  import GameTile from '$lib/catalog/GameTile.svelte';
  import GameHero from '$lib/catalog/GameHero.svelte';
  import SimilarRow from '$lib/game/SimilarRow.svelte';
  import SimBadges from '$lib/game/SimBadges.svelte';
  import TagChip from '$lib/game/TagChip.svelte';

  type G = { id: number; name: string; year: number | null; rating: number | null; thumb: string | null };

  // Real games: a few with art, a long name, and one with no thumbnail.
  const IDS = [224517, 256730, 28720, 342942, 68448, 266192];
  let games = $state<G[]>([]);
  let noArt = $state<G | null>(null);

  $effect(() => {
    initCatalog();
  });
  $effect(() => {
    if (catalog.status !== 'ready') return;
    const cols = `c.game_id AS id, c.name, c.year_published AS year, c.average_rating AS rating, t.thumbnail AS thumb`;
    query<G>(
      `SELECT ${cols} FROM catalog c LEFT JOIN thumbnails t USING (game_id) WHERE c.game_id IN (${IDS.join(',')})`
    ).then((r) => (games = IDS.flatMap((id) => r.filter((g) => Number(g.id) === id))));
    query<G>(
      `SELECT ${cols} FROM catalog c LEFT JOIN thumbnails t USING (game_id)
       WHERE t.thumbnail IS NULL ORDER BY c.users_rated DESC NULLS LAST LIMIT 1`
    ).then((r) => (noArt = r[0] ?? null));
  });

  const longName = $derived(
    games.length
      ? { ...games[0], name: 'Power Grid Deluxe: Europe/North America (a deliberately long title)' }
      : null
  );
  const sims = [0.89, 0.84, 0.77, 0.66, 0.52, 0.41];
  const why = 'Both ~3.5 · 2–4 players · Market';

  let segSm = $state<'count' | 'share'>('share');
  let segMd = $state<'shelf' | 'unowned' | 'all'>('shelf');
  let segLg = $state<'like' | 'find'>('like');
  let heroOpen = $state(true);
</script>

<svelte:head><title>Components · dev</title></svelte:head>

<Container size="list">
  <Stack gap="lg">
    <h1>Shared game components</h1>

    <section>
      <h2>SegmentedControl</h2>
      <Stack gap="sm">
        <div class="row">
          <span class="lbl">sm</span>
          <SegmentedControl label="sm" size="sm" value={segSm} onchange={(v) => (segSm = v)}
            options={[{ value: 'count', label: 'Count' }, { value: 'share', label: 'Share' }]} />
        </div>
        <div class="row">
          <span class="lbl">md</span>
          <SegmentedControl label="md" size="md" value={segMd} onchange={(v) => (segMd = v)}
            options={[
              { value: 'shelf', label: 'my shelf' },
              { value: 'unowned', label: 'games I don’t own' },
              { value: 'all', label: 'anywhere' }
            ]} />
        </div>
        <div class="row">
          <span class="lbl">lg</span>
          <SegmentedControl label="lg" size="lg" value={segLg} onchange={(v) => (segLg = v)}
            options={[{ value: 'like', label: 'I want games like…' }, { value: 'find', label: 'Help me find a game' }]} />
        </div>
        <div class="row">
          <span class="lbl">disabled</span>
          <SegmentedControl label="with a disabled option" size="sm" value="a" onchange={() => {}}
            options={[{ value: 'a', label: 'Recommended' }, { value: 'b', label: 'Most Similar' }, { value: 'c', label: 'Dark Horses', disabled: true }]} />
        </div>
      </Stack>
    </section>

    <section>
      <h2>GameTile</h2>
      <p class="note">Full: badges, then the name and a facts slot. Sample fact text.</p>
      <AutoGrid min="md" gap="md">
        {#each games.slice(0, 4) as g, i (g.id)}
          <GameTile href="/games/{g.id}" name={g.name} year={g.year} thumbnail={g.thumb} similarity={sims[i]} rating={g.rating}>
            {#snippet facts()}<span>{why}</span>{/snippet}
          </GameTile>
        {/each}
      </AutoGrid>
      <p class="note">No art, a long name, no badges.</p>
      <AutoGrid min="md" gap="md">
        {#if noArt}
          <GameTile href="/games/{noArt.id}" name={noArt.name} year={noArt.year} thumbnail={null} similarity={0.7} rating={noArt.rating}>
            {#snippet facts()}<span>{why}</span>{/snippet}
          </GameTile>
        {/if}
        {#if longName}
          <GameTile href="/games/{longName.id}" name={longName.name} year={longName.year} thumbnail={longName.thumb} similarity={0.78} rating={longName.rating}>
            {#snippet facts()}<span>{why}</span>{/snippet}
          </GameTile>
        {/if}
        {#if games[1]}
          <GameTile href="/games/{games[1].id}" name={games[1].name} year={games[1].year} thumbnail={games[1].thumb} />
        {/if}
      </AutoGrid>
      <p class="note">Compact.</p>
      <AutoGrid min="sm" gap="sm">
        {#each games as g (g.id)}
          <GameTile compact href="/games/{g.id}" name={g.name} year={g.year} thumbnail={g.thumb} />
        {/each}
      </AutoGrid>
    </section>

    <section>
      <h2>GameHero</h2>
      {#if games[0] && heroOpen}
        {@const g = games[0]}
        <GameHero href="/games/{g.id}" name={g.name} image={g.thumb} onclose={() => (heroOpen = false)}>
          {#snippet meta()}
            {#if g.year}<span>{g.year}</span>{/if}
            <SimBadges similarity={0.81} rating={g.rating} />
            <span>not on your shelf</span>
          {/snippet}
          {#snippet actions()}
            <Button>Another one</Button>
            <Button variant="outline">More like this</Button>
            <Button variant="link" href="/games/{g.id}">Open game ↗</Button>
          {/snippet}
          <p class="note">The body slot: Recommend puts the full "why" here.</p>
        </GameHero>
      {:else}
        <Button variant="outline" onclick={() => (heroOpen = true)}>Show the hero again</Button>
      {/if}
      {#if games[1]}
        {@const g = games[1]}
        <p class="note">No close button, no body.</p>
        <GameHero href="/games/{g.id}" name={g.name} image={g.thumb}>
          {#snippet meta()}{#if g.year}<span>{g.year}</span>{/if}{/snippet}
          {#snippet actions()}<Button>Another one</Button>{/snippet}
        </GameHero>
      {/if}
    </section>

    <section>
      <h2>SimilarRow</h2>
      <Stack gap="sm">
        {#each games.slice(0, 3) as g, i (g.id)}
          <SimilarRow href="/games/{g.id}" name={g.name} year={g.year} thumbnail={g.thumb} similarity={sims[i]} rating={g.rating}>
            {#if i === 0}{why}{/if}
          </SimilarRow>
        {/each}
      </Stack>
    </section>

    <section>
      <h2>TagChip</h2>
      <div class="chips">
        <TagChip kind="mech" tag="Network and Route Building" />
        <TagChip kind="mech" tag="Market" />
        <TagChip kind="cat" tag="Economic" />
        <TagChip kind="cat" tag="Industry / Manufacturing" />
        <TagChip kind="fam" tag="Players: Two-Player Only Games" />
      </div>
    </section>
  </Stack>
</Container>

<style>
  h1 { font-size: var(--text-heading); font-weight: 750; margin: var(--space-md) 0 0; }
  h2 { font-size: 1rem; font-weight: 700; margin: 0 0 var(--space-sm); }
  .row { display: flex; align-items: center; gap: var(--space-md); }
  .lbl { width: 4.5rem; font-size: 0.75rem; color: var(--muted-foreground); }
  .note { font-size: 0.8rem; color: var(--muted-foreground); margin: var(--space-sm) 0; }
  .chips { display: flex; flex-wrap: wrap; gap: 0.35rem; }
</style>
