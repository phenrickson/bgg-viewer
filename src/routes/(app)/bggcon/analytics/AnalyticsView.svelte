<script lang="ts">
  /**
   * The analytics: summary numbers, activity charts, game charts
   * (spec: docs/superpowers/specs/2026-11-17-bggcon-analytics-design.md; the mockup's layout).
   * Every card is drawn from the start; while `data` is null (still loading) each one spins in
   * place of its content. All times are Chicago time. PLACEHOLDER copy throughout (Phil).
   */
  import * as Card from '$lib/components/ui/card';
  import { AutoGrid, Stack } from '$lib/components/ui/layout';
  import { kpis } from '$lib/bggcon/analytics';
  import ActivityRow from './ActivityRow.svelte';
  import ConTimeline from './ConTimeline.svelte';
  import GameRanks from './GameRanks.svelte';
  import { Spinner } from '$lib/components/ui/spinner';
  import type { BggconActivity, BggconGames } from '$lib/server/warehouse/types';

  let { data, narrow }: {
    data: { activity: BggconActivity | null; games: BggconGames | null; error: string | null } | null;
    narrow: boolean;
  } = $props();

  /**
   * Drawing the charts blocks the browser for a moment once the data is in, and nothing can
   * paint meanwhile. So the cards go on screen first, spinning, and the charts are drawn a
   * frame later: `view` stays null until the spinners have had a frame to paint.
   */
  let painted = $state(false);
  $effect(() => {
    painted = false;
    if (!data) return;
    let inner = 0;
    const outer = requestAnimationFrame(() => (inner = requestAnimationFrame(() => (painted = true))));
    return () => {
      cancelAnimationFrame(outer);
      cancelAnimationFrame(inner);
    };
  });
  const view = $derived(painted ? data : null);

  const fmtHour = (h: number) => `${h % 12 || 12} ${h < 12 ? 'AM' : 'PM'}`;
  const activity = $derived(view?.activity ?? null);
  const k = $derived(activity ? kpis(activity) : null);
  const GAME_CHARTS = [
    { kind: 'checkouts', title: 'Most checked out', hint: 'checkouts so far' },
    { kind: 'demand', title: 'Most in demand', hint: 'share of open time all copies were out' },
    { kind: 'steam', title: 'Gaining steam', hint: 'checkouts, last 3 h vs the 3 h before' },
    { kind: 'time', title: 'Kept out longest', hint: 'time out per checkout' }
  ] as const;
  const gamesOut = $derived(view?.games?.games.filter((g) => g.checkouts > 0).length ?? 0);
</script>

{#snippet kpi(value: string, label: string)}
  <Card.Root size="sm">
    <Card.Content>
      {#if k}<div class="v tnum">{value}</div>{:else}<div class="loading" style:height="2.25rem"><Spinner /></div>{/if}
      <div class="dim">{label}</div>
    </Card.Content>
  </Card.Root>
{/snippet}

{#if view?.error}
  <div class="err" role="alert">
    <b>Couldn’t load the library analytics.</b>
    <p>{view.error}</p>
  </div>
{:else}
  <div class="charts">
  <Stack>
    <AutoGrid min="sm">
      {@render kpi((k?.total ?? 0).toLocaleString(), 'checkouts so far')}
      {@render kpi((k?.lastHour ?? 0).toLocaleString(), 'checkouts in the last hour')}
      {@render kpi(
        k?.busiest ? `${k.busiest.day} ${fmtHour(k.busiest.hour)}` : '—',
        `busiest hour so far${k?.busiest ? ` · ${k.busiest.checkouts}` : ''}`
      )}
      {@render kpi(gamesOut.toLocaleString(), 'different games checked out')}
    </AutoGrid>

    <section>
      <h2>Activity <span class="dim">checkouts, Chicago time</span></h2>
      <Stack>
        <Card.Root size="sm">
          <Card.Header><Card.Title>Over the con</Card.Title><Card.Description>every 15 minutes · shaded = library closed</Card.Description></Card.Header>
          <Card.Content>{#if activity}<ConTimeline {activity} />{:else}<div class="loading" style:height="13rem"><Spinner /></div>{/if}</Card.Content>
        </Card.Root>
        <ActivityRow {activity} />
      </Stack>
    </section>

    <section>
      <h2>Games <span class="dim">top 10 each</span></h2>
      <AutoGrid min="lg">
        {#each GAME_CHARTS as c (c.kind)}
          <Card.Root size="sm">
            <Card.Header><Card.Title>{c.title}</Card.Title><Card.Description>{c.hint}</Card.Description></Card.Header>
            <Card.Content>
              {#if view?.games}<GameRanks games={view.games.games} kind={c.kind} {narrow} />{:else}<div class="loading" style:height="6rem"><Spinner /></div>{/if}
            </Card.Content>
          </Card.Root>
        {/each}
      </AutoGrid>
    </section>
  </Stack>
  </div>
{/if}

<style>
  /* Holds a card's place while its data loads, so nothing jumps when it arrives. */
  .loading { display: grid; place-items: center; }
  .dim { color: var(--muted-foreground); font-size: 0.8rem; font-weight: 400; margin: 0; }
  h2 { font-size: 1.05rem; font-weight: 650; margin: 0 0 var(--space-md); display: flex; gap: 0.6rem; align-items: baseline; flex-wrap: wrap; }
  section { min-width: 0; }
  /* Chart chrome for every chart on this page: recessive hairline grid, muted axis text, and a
     tooltip on the app's popover surface (LayerChart's default reads tokens this app doesn't
     define, so it fell back to a cramped black box). Value leads; the label follows. */
  .charts :global(.lc-grid-x-line), .charts :global(.lc-grid-y-line) { stroke: var(--border); stroke-width: 1; stroke-dasharray: none; opacity: 1; }
  .charts :global(.lc-rule-x-line), .charts :global(.lc-rule-y-line), .charts :global(.lc-axis-rule) { stroke: color-mix(in oklab, var(--muted-foreground) 45%, transparent); }
  .charts :global(.lc-axis-tick-label) { fill: var(--muted-foreground); font-size: 11px; stroke: none; }
  .charts :global(.ranks .lc-axis[data-placement='left'] .lc-axis-tick-label) { fill: var(--foreground); font-size: 12px; }
  .charts :global(.lc-tooltip-container) {
    background: var(--popover); color: var(--popover-foreground); border: 1px solid var(--border);
    border-radius: calc(var(--radius) - 2px); padding: 0.55rem 0.7rem; min-width: 10rem; max-width: 18rem;
    box-shadow: 0 8px 24px -8px rgb(0 0 0 / 0.35); backdrop-filter: none; font-size: 0.78rem; line-height: 1.3;
  }
  .charts :global(.lc-tooltip-header) {
    font-weight: 600; font-size: 0.82rem; white-space: normal; border-bottom: 1px solid var(--border);
    padding-bottom: 0.4rem; margin-bottom: 0.4rem;
  }
  .charts :global(.lc-tooltip-list) { column-gap: 1.25rem; row-gap: 0.25rem; }
  .charts :global(.lc-tooltip-item-label) { color: var(--muted-foreground); }
  .charts :global(.lc-tooltip-item-value) { color: var(--popover-foreground); font-weight: 600; font-variant-numeric: tabular-nums; }
  .v { font-size: 1.5rem; font-weight: 650; }
  .tnum { font-variant-numeric: tabular-nums; }
  .err { background: var(--card); border: 1px solid var(--border); border-left: 4px solid var(--status-fail); border-radius: var(--radius); padding: var(--space-lg); }
  .err p { margin: 0.3rem 0 0; color: var(--muted-foreground); font-family: ui-monospace, Menlo, monospace; font-size: 0.82rem; }
</style>
