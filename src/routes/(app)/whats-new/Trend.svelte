<script lang="ts">
  /**
   * Games added per day/week over the selected window — the same rows the table
   * already shows, so this always reflects both the day-range AND the tier filter,
   * never an unfiltered total the table itself disagrees with.
   *
   * Bucketing is page-specific (by `first_seen`); rendering delegates to the
   * reusable $lib/charts/TimeSeriesArea component.
   */
  import TimeSeriesArea from '$lib/charts/TimeSeriesArea.svelte';
  import type { NewGameRow } from '$lib/server/warehouse';

  let { rows, days }: { rows: NewGameRow[]; days: number } = $props();

  const DAY_MS = 86_400_000;

  type Bucket = { from: Date; to: Date; n: number };

  /**
   * Daily buckets for 7/30-day windows; weekly for 365 — a year of individual
   * day-points would be too dense to read, and this page has no use for day-level
   * granularity that far back.
   */
  const buckets = $derived.by((): Bucket[] => {
    const now = new Date();
    const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
    const bucketDays = days > 30 ? 7 : 1;
    const bucketCount = Math.ceil(days / bucketDays);

    const bs: Bucket[] = [];
    for (let i = bucketCount - 1; i >= 0; i--) {
      const to = new Date(today.getTime() - i * bucketDays * DAY_MS + DAY_MS);
      const from = new Date(to.getTime() - bucketDays * DAY_MS);
      bs.push({ from, to, n: 0 });
    }

    for (const r of rows) {
      const t = new Date(r.first_seen).getTime();
      for (let i = bs.length - 1; i >= 0; i--) {
        if (t >= bs[i].from.getTime() && t < bs[i].to.getTime()) {
          bs[i].n++;
          break;
        }
      }
    }
    return bs;
  });

  const unit = $derived(days > 30 ? 'week' : 'day');

  const series = $derived(buckets.map((b) => ({ date: b.from, count: b.n })));
</script>

<div class="trend" role="img" aria-label="Games added per {unit} over the selected window">
  <TimeSeriesArea data={series} />
</div>

<style>
  .trend {
    width: 100%;
  }
</style>
