<script lang="ts">
  import { Container } from '$lib/components/ui/layout';
  import { hurdleTier } from '$lib/monitoring/hurdleTier';
  import type { PageData } from './$types';

  let { data }: { data: PageData } = $props();

  const RANGES = [7, 30, 365] as const;

  const dateFmt = new Intl.DateTimeFormat('en-US', {
    month: 'short',
    day: 'numeric',
    hour: 'numeric',
    minute: '2-digit'
  });

  function formatSeen(iso: string): string {
    return dateFmt.format(new Date(iso));
  }
</script>

<svelte:head><title>What's new · bgg-viewer</title></svelte:head>

<div class="page">
  <Container size="list">
    <h1>What's new</h1>
    <!-- PLACEHOLDER copy — Phil writes the real prose. -->
    <p class="lede">[Games recently added to the warehouse.]</p>

    <div class="toolbar">
      <div class="seg" role="group" aria-label="Time range">
        {#each RANGES as r (r)}
          <a href="?days={r}" class:on={data.days === r}>{r} days</a>
        {/each}
      </div>
      <span class="count">{data.games.length.toLocaleString()} game{data.games.length === 1 ? '' : 's'}</span>
    </div>

    <div class="list">
      {#each data.games as g (g.game_id)}
        {@const tier = hurdleTier(g.predicted_hurdle_prob)}
        <a class="row" href="/games/{g.game_id}">
          <span class="thumb" aria-hidden="true">
            {#if g.thumbnail}
              <img src={g.thumbnail} alt="" loading="lazy" />
            {:else}
              {g.name.charAt(0).toUpperCase()}
            {/if}
          </span>
          <span class="info">
            <span class="name">{g.name}</span>
            <span class="meta">
              {g.year_published ?? '—'} · added {formatSeen(g.first_seen)}
            </span>
          </span>
          {#if tier}
            <span class="badge {tier}">{tier === 'standout' ? 'Standout' : 'Promising'}</span>
          {/if}
        </a>
      {/each}

      {#if !data.games.length}
        <p class="empty">No games added in this window. Try a longer range above.</p>
      {/if}
    </div>
  </Container>
</div>

<style>
  .lede {
    color: var(--muted-foreground);
    margin: 0 0 var(--space-lg);
  }
  .toolbar {
    display: flex;
    align-items: center;
    justify-content: space-between;
    flex-wrap: wrap;
    gap: var(--space-md);
    margin-bottom: var(--space-md);
  }
  .seg {
    display: inline-flex;
    border: 1px solid var(--border);
    border-radius: var(--radius);
    overflow: hidden;
  }
  .seg a {
    padding: 0.4rem 0.9rem;
    font-size: 0.85rem;
    color: var(--muted-foreground);
    text-decoration: none;
    border-right: 1px solid var(--border);
  }
  .seg a:last-child {
    border-right: none;
  }
  .seg a.on {
    background: var(--muted);
    color: var(--foreground);
    font-weight: 600;
  }
  .count {
    font-size: 0.82rem;
    color: var(--muted-foreground);
    font-variant-numeric: tabular-nums;
  }
  .list {
    border: 1px solid var(--border);
    border-radius: var(--radius);
    overflow: hidden;
    background: var(--card);
  }
  .row {
    display: flex;
    align-items: center;
    gap: var(--space-md);
    padding: 0.65rem var(--space-md);
    text-decoration: none;
    color: inherit;
    border-bottom: 1px solid var(--border);
  }
  .row:last-child {
    border-bottom: none;
  }
  .row:hover {
    background: color-mix(in oklch, var(--primary) 8%, transparent);
  }
  .thumb {
    flex: none;
    width: 2.75rem;
    height: 2.75rem;
    border-radius: 6px;
    background: var(--muted);
    color: var(--muted-foreground);
    display: flex;
    align-items: center;
    justify-content: center;
    font-size: 0.85rem;
    font-weight: 600;
    overflow: hidden;
  }
  .thumb img {
    width: 100%;
    height: 100%;
    object-fit: cover;
  }
  .info {
    flex: 1 1 auto;
    min-width: 0;
    display: flex;
    flex-direction: column;
    gap: 0.1rem;
  }
  .name {
    font-weight: 600;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }
  .meta {
    font-size: 0.8rem;
    color: var(--muted-foreground);
    font-variant-numeric: tabular-nums;
  }
  .badge {
    flex: none;
    font-size: 0.72rem;
    font-weight: 600;
    padding: 0.2rem 0.55rem;
    border-radius: 999px;
    white-space: nowrap;
  }
  .badge.standout {
    background: var(--color-positive);
    color: oklch(0.99 0.01 80);
  }
  .badge.promising {
    background: color-mix(in oklch, var(--color-positive) 16%, transparent);
    color: var(--color-positive);
    border: 1px solid color-mix(in oklch, var(--color-positive) 45%, transparent);
  }
  .empty {
    padding: var(--space-lg);
    text-align: center;
    color: var(--muted-foreground);
  }
</style>
