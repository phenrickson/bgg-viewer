<script lang="ts">
  /**
   * The sneak peek: a handful of real games as a real table, fading out at the bottom.
   *
   * Borrowed from fantasycalc.com, where a truncated rankings table does more to explain the
   * product than any paragraph. This is the element that makes "explore board games as a set"
   * mean something to someone who has never seen the app: actual rows, actual box art, actual
   * numbers — visibly cut off, so the full thing is one click away.
   *
   * Static from content.json for everyone, including logged-in users. The catalog is fast
   * now, but cold is still several seconds, and a table that shows a spinner before it fills
   * is a worse first impression than one that is simply there. Orientation does not need
   * this morning's data; the rooms are for that.
   *
   * Only the footer varies by auth: the door out is /login?next=... or straight to Explore.
   *
   * Copy is PLACEHOLDER — Phil writes the final strings.
   */
  import type { Featured } from '$lib/landing/types';

  let { games, total, exploreHref, loggedIn }:
    { games: Featured[]; total: number; exploreHref: string; loggedIn: boolean } = $props();

  const fmt1 = (n: number | null) => (n == null ? '—' : n.toFixed(1));
  const fmt2 = (n: number | null) => (n == null ? '—' : n.toFixed(2));
</script>

<section class="peek" aria-labelledby="peek-h">
  <!-- PLACEHOLDER copy -->
  <p class="eyebrow">Sneak peek</p>
  <h2 id="peek-h">A few of the {total.toLocaleString()} games in here</h2>

  <div class="tablewrap">
    <table>
      <thead>
        <tr>
          <th class="art" aria-label="Box art"></th>
          <th>Game</th>
          <th class="num">Year</th>
          <th class="num">Rating</th>
          <th class="num">Weight</th>
        </tr>
      </thead>
      <tbody>
        {#each games as g (g.id)}
          <tr>
            <td class="art">
              {#if g.image}
                <img src={g.image} alt="" loading="lazy" width="40" height="30" />
              {:else}
                <span class="ph">{g.name.slice(0, 1)}</span>
              {/if}
            </td>
            <td>
              <span class="name">{g.name}</span>
              <span class="note">{g.fact ?? g.note}</span>
            </td>
            <td class="num">{g.year ?? '—'}</td>
            <td class="num strong">{fmt2(g.geek)}</td>
            <td class="num">{fmt1(g.weight)}</td>
          </tr>
        {/each}
      </tbody>
    </table>
    <!-- The fade is the point: it says "there is more" without a word of copy. -->
    <div class="fade" aria-hidden="true"></div>
  </div>

  <!-- PLACEHOLDER copy -->
  <a class="more" href={exploreHref}>
    {#if loggedIn}
      Open all {total.toLocaleString()} in Explore →
    {:else}
      Log in to explore all {total.toLocaleString()} →
    {/if}
  </a>
</section>

<style>
  .peek { display: flex; flex-direction: column; gap: .6rem; }
  .eyebrow { font-size: .72rem; text-transform: uppercase; letter-spacing: .06em; color: var(--muted-foreground); font-weight: 600; margin: 0; }
  h2 { font-size: var(--text-heading, clamp(1.25rem, 1rem + 1.2vw, 1.75rem)); font-weight: 700; letter-spacing: -0.02em; margin: 0 0 .4rem; }

  .tablewrap { position: relative; border: 1px solid var(--border); border-radius: var(--radius); background: var(--card); overflow: hidden; }
  table { width: 100%; border-collapse: collapse; font-size: .9rem; }
  th { text-align: left; font-size: .72rem; text-transform: uppercase; letter-spacing: .05em; color: var(--muted-foreground); font-weight: 600; padding: .6rem .75rem; border-bottom: 1px solid var(--border); }
  td { padding: .55rem .75rem; border-bottom: 1px solid color-mix(in oklch, var(--border) 60%, transparent); vertical-align: middle; }
  tr:last-child td { border-bottom: 0; }
  .num { text-align: right; font-variant-numeric: tabular-nums; white-space: nowrap; }
  .strong { font-weight: 700; }
  .art { width: 3rem; padding-right: 0; }
  .art img { display: block; width: 40px; height: 30px; object-fit: cover; border-radius: 3px; }
  .ph { display: grid; place-items: center; width: 40px; height: 30px; border-radius: 3px; background: color-mix(in oklch, var(--primary) 12%, var(--card)); color: var(--primary); font-weight: 700; font-size: .8rem; }
  .name { display: block; font-weight: 600; }
  .note { display: block; font-size: .76rem; color: var(--muted-foreground); }

  /* Bottom ~40% fades to the card colour so the last rows read as "continues below". */
  .fade { position: absolute; inset: auto 0 0 0; height: 42%; pointer-events: none;
    background: linear-gradient(to bottom, transparent, var(--card) 85%); }

  .more { align-self: flex-start; font-weight: 600; color: var(--primary); text-decoration: none; font-size: .95rem; margin-top: .2rem; }
  .more:hover { text-decoration: underline; }

  @media (max-width: 40rem) {
    th.num:nth-child(3), td.num:nth-child(3) { display: none; } /* drop Year when tight */
  }
</style>
