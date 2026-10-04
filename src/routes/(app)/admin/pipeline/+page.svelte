<script lang="ts">
  import { Container, Stack } from '$lib/components/ui/layout';
  import ChainLanes from '$lib/monitoring/ChainLanes.svelte';
  import DeployedModels from '$lib/monitoring/DeployedModels.svelte';
  import HistoryGrid from '$lib/monitoring/HistoryGrid.svelte';
  import TableStatus from '$lib/monitoring/TableStatus.svelte';
  import Verdict from '$lib/monitoring/Verdict.svelte';
  import { clock, freshnessReference } from '$lib/monitoring/display';
  import type { PageData } from './$types';

  let { data }: { data: PageData } = $props();
  const now = new Date();
</script>

<svelte:head><title>Pipeline · bgg-viewer</title></svelte:head>

<Container>
  <Stack>
    <header class="head">
      <h1>Pipeline</h1>
      {#if data.status}<span>as of {clock(data.status.generated_at)} UTC</span>{/if}
    </header>

    {#if data.error || !data.status}
      <div class="err" role="alert">
        <b>Couldn't load pipeline status.</b>
        <p>{data.error}</p>
      </div>
    {:else}
      {@const s = data.status}
      <Verdict verdict={s.verdict} {now} />

      <section>
        <h2>Today's chain <span>{s.today.day}</span></h2>
        <ChainLanes stages={s.today.stages} offChain={s.today.off_chain} />
      </section>

      <section>
        <h2>Last {s.history.length} days <span>one cell per stage per day · newest on the right</span></h2>
        <HistoryGrid history={s.history} stages={s.today.stages} />
      </section>

      <section>
        <h2>Data freshness &amp; coverage <span>coverage = games in the table ÷ games it should cover</span></h2>
        <TableStatus tables={s.tables} catalog={data.catalog} reference={freshnessReference(s.today)} />
      </section>

      <section>
        <h2>Deployed models <span>every version behind a current prediction · older versions flagged</span></h2>
        <DeployedModels models={s.models} />
      </section>
    {/if}
  </Stack>
</Container>

<style>
  .head { display: flex; align-items: baseline; gap: 0.75rem; flex-wrap: wrap; }
  .head h1 { margin: 0; font-size: var(--text-heading); }
  .head span, h2 span { color: var(--muted-foreground); font-size: 0.8rem; font-weight: 400; }
  h2 { font-size: 1.05rem; font-weight: 650; margin: 0 0 var(--space-md); display: flex; gap: 0.6rem; align-items: baseline; flex-wrap: wrap; }
  section { min-width: 0; }
  .err { background: var(--card); border: 1px solid var(--border); border-left: 4px solid var(--status-fail); border-radius: var(--radius); padding: var(--space-lg); }
  .err p { margin: 0.3rem 0 0; color: var(--muted-foreground); font-family: ui-monospace, Menlo, monospace; font-size: 0.82rem; }
</style>
