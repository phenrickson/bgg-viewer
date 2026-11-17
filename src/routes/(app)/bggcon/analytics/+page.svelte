<script lang="ts">
  /**
   * BGG.CON library analytics: checkouts over the con and the busiest games
   * (spec: docs/superpowers/specs/2026-11-17-bggcon-analytics-design.md; the mockup's layout).
   * All times are Chicago time. PLACEHOLDER copy throughout (Phil).
   */
  import { MediaQuery } from 'svelte/reactivity';
  import * as Card from '$lib/components/ui/card';
  import { AutoGrid, Container, Stack } from '$lib/components/ui/layout';
  import { chicago, kpis } from '$lib/bggcon/analytics';
  import ActivityRow from './ActivityRow.svelte';
  import ConTimeline from './ConTimeline.svelte';
  import GameRanks from './GameRanks.svelte';
  import type { PageData } from './$types';

  let { data }: { data: PageData } = $props();

  const narrowQuery = new MediaQuery('max-width: 40rem');
  const narrow = $derived(narrowQuery.current);

  const fmtHour = (h: number) => `${h % 12 || 12} ${h < 12 ? 'AM' : 'PM'}`;
  const asOf = $derived.by(() => {
    if (!data.activity?.as_of) return null;
    const t = chicago(data.activity.as_of);
    return `${t.day} ${t.date} Nov, ${fmtHour(t.hour).replace(' ', `:${String(t.minute).padStart(2, '0')} `)}`;
  });
  const k = $derived(data.activity ? kpis(data.activity) : null);
  const GAME_CHARTS = [
    { kind: 'checkouts', title: 'Most checked out', hint: 'checkouts so far' },
    { kind: 'demand', title: 'Most in demand', hint: 'share of open time with every copy out · copies beside the name' },
    { kind: 'steam', title: 'Gaining steam', hint: 'checkouts, the 3 h before vs the last 3 h' },
    { kind: 'time', title: 'Kept out longest', hint: 'time out per checkout' }
  ] as const;
  const gamesOut = $derived(data.games?.games.filter((g) => g.checkouts > 0).length ?? 0);
</script>

<svelte:head><title>BGG.CON Analytics · Boardgame-Viz</title></svelte:head>

<Container size="wide">
  <Stack>
    <header class="head" class:narrow>
      <h1>BGG.CON analytics</h1>
      {#if asOf}<span class="dim">as of {asOf} Chicago</span>{/if}
    </header>

    {#if data.error}
      <div class="err" role="alert">
        <b>Couldn’t load the library analytics.</b>
        <p>{data.error}</p>
      </div>
    {:else if !data.activity?.as_of || !k}
      <p class="dim">No library activity recorded yet. The recorder starts counting when the library opens.</p>
    {:else}
      <AutoGrid min="sm">
        <Card.Root size="sm"><Card.Content><div class="v tnum">{k.total.toLocaleString()}</div><div class="dim">checkouts so far</div></Card.Content></Card.Root>
        <Card.Root size="sm"><Card.Content><div class="v tnum">{k.lastHour.toLocaleString()}</div><div class="dim">checkouts in the last hour</div></Card.Content></Card.Root>
        <Card.Root size="sm"><Card.Content><div class="v">{k.busiest ? `${k.busiest.day} ${fmtHour(k.busiest.hour)}` : '—'}</div><div class="dim">busiest hour so far{#if k.busiest} · {k.busiest.checkouts}{/if}</div></Card.Content></Card.Root>
        <Card.Root size="sm"><Card.Content><div class="v tnum">{gamesOut.toLocaleString()}</div><div class="dim">different games checked out</div></Card.Content></Card.Root>
      </AutoGrid>

      <section>
        <h2>Activity <span class="dim">checkouts, Chicago time</span></h2>
        <Stack>
          <Card.Root size="sm">
            <Card.Header><Card.Title>Over the con</Card.Title><Card.Description>every 15 minutes · shaded = library closed</Card.Description></Card.Header>
            <Card.Content><ConTimeline activity={data.activity} /></Card.Content>
          </Card.Root>
          <ActivityRow activity={data.activity} />
        </Stack>
      </section>

      {#if data.games}
        <section>
          <h2>Games <span class="dim">top 10 each</span></h2>
          <AutoGrid min="lg">
            {#each GAME_CHARTS as c (c.kind)}
              <Card.Root size="sm">
                <Card.Header><Card.Title>{c.title}</Card.Title><Card.Description>{c.hint}</Card.Description></Card.Header>
                <Card.Content><GameRanks games={data.games.games} kind={c.kind} {narrow} /></Card.Content>
              </Card.Root>
            {/each}
          </AutoGrid>
        </section>
      {/if}
    {/if}
  </Stack>
</Container>

<style>
  .head h1 { margin: 0; font-size: var(--text-heading); }
  .head { display: flex; align-items: baseline; gap: 0.75rem; flex-wrap: wrap; padding-top: var(--space-md); }
  .dim { color: var(--muted-foreground); font-size: 0.8rem; font-weight: 400; }
  h2 { font-size: 1.05rem; font-weight: 650; margin: 0 0 var(--space-md); display: flex; gap: 0.6rem; align-items: baseline; flex-wrap: wrap; }
  section { min-width: 0; }
  .v { font-size: 1.5rem; font-weight: 650; }
  .tnum { font-variant-numeric: tabular-nums; }
  .err { background: var(--card); border: 1px solid var(--border); border-left: 4px solid var(--status-fail); border-radius: var(--radius); padding: var(--space-lg); }
  .err p { margin: 0.3rem 0 0; color: var(--muted-foreground); font-family: ui-monospace, Menlo, monospace; font-size: 0.82rem; }
</style>
