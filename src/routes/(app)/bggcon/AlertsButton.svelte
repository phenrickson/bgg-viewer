<script lang="ts">
  /**
   * The 🔔 on /bggcon: opens a sheet with the user's phone-alert topic and how to subscribe to
   * it in ntfy (spec §8). The alerts themselves never show here; the recorder pushes them to
   * the phone. The topic is fetched on first open, not on page load.
   */
  import BellIcon from '@lucide/svelte/icons/bell';
  import * as Sheet from '$lib/components/ui/sheet';
  import { Button } from '$lib/components/ui/button';

  let { narrow }: { narrow: boolean } = $props();

  let open = $state(false);
  let topic = $state<string | null>(null);
  let error = $state<string | null>(null);
  let copied = $state(false);
  let topicEl = $state<HTMLElement | null>(null);

  async function load() {
    error = null;
    try {
      const res = await fetch('/api/bggcon/alerts');
      if (!res.ok) throw new Error(String(res.status));
      topic = ((await res.json()) as { topic: string }).topic;
    } catch {
      error = 'Couldn’t load your alert topic. Close this and try again.'; // PLACEHOLDER copy (Phil)
    }
  }

  $effect(() => {
    if (open && !topic) load();
  });

  async function copy() {
    if (!topic) return;
    try {
      await navigator.clipboard.writeText(topic);
      copied = true;
      setTimeout(() => (copied = false), 1500);
    } catch {
      // No clipboard (an older browser or app view): select it for a manual copy instead.
      if (topicEl) getSelection()?.selectAllChildren(topicEl);
    }
  }
</script>

<Button variant="outline" size="icon-sm" class="shrink-0" aria-label="Phone alerts" title="Phone alerts" onclick={() => (open = true)}>
  <BellIcon />
</Button>

<Sheet.Root bind:open>
  <Sheet.Content side={narrow ? 'bottom' : 'right'}>
    <!-- PLACEHOLDER copy throughout (Phil). -->
    <Sheet.Header>
      <Sheet.Title>Phone alerts</Sheet.Title>
      <Sheet.Description>
        Get a push on your phone when a game in your focus list comes back on the shelf.
      </Sheet.Description>
    </Sheet.Header>
    <div class="body">
      {#if error}
        <p class="err">{error}</p>
      {:else if !topic}
        <p class="dim">Loading your topic…</p>
      {:else}
        <div class="topic">
          <code bind:this={topicEl}>{topic}</code>
          <Button variant="outline" size="sm" onclick={copy}>{copied ? 'Copied' : 'Copy'}</Button>
        </div>
      {/if}
      <ol>
        <li>Install the <b>ntfy</b> app (App Store or Google Play).</li>
        <li>Tap <b>+</b> and paste the topic above. Leave the server as ntfy.sh.</li>
        <li>Star games here. You’ll get an alert when one that was all checked out has a copy back.</li>
      </ol>
      <p class="dim">Anyone who knows this topic can see its alerts.</p>
    </div>
    <Sheet.Footer>
      <Button onclick={() => (open = false)}>Done</Button>
    </Sheet.Footer>
  </Sheet.Content>
</Sheet.Root>

<style>
  .body { display: flex; flex-direction: column; gap: var(--space-md); padding: 0 var(--space-md); }
  .topic { display: flex; gap: var(--space-sm); align-items: center; }
  .topic code {
    flex: 1;
    min-width: 0;
    overflow-wrap: anywhere;
    font-family: ui-monospace, 'Cascadia Mono', Consolas, monospace;
    padding: var(--space-sm);
    border: 1px solid var(--border);
    border-radius: var(--radius);
    background: var(--muted);
  }
  ol { margin: 0; padding-left: 1.25rem; line-height: 1.6; list-style: decimal; }
  .dim { color: var(--muted-foreground); }
  .err { color: var(--destructive); }
</style>
