<script lang="ts">
  import { onDestroy, untrack } from 'svelte';
  import { superForm } from 'sveltekit-superforms';
  import { zod4 as zod } from 'sveltekit-superforms/adapters';
  import { enhance } from '$app/forms';
  import { settingsSchema } from '$lib/schemas';

  let { data } = $props();

  const sf = superForm(untrack(() => data.form), { validators: zod(settingsSchema) });
  const { form, errors, enhance: superEnhance, submitting, message } = sf;

  // A local, updatable snapshot of sync status — refreshed by polling below rather than a full
  // page reload, since the whole point of not awaiting the refresh server-side is to avoid
  // blocking on it client-side too. Still needs to track `data.collection` when THAT changes
  // for its own reason (e.g. Save re-links to a different username and reloads), hence the
  // effect rather than a one-shot `$state(data.collection)`.
  let collection = $state<typeof data.collection>(null);
  $effect(() => {
    collection = data.collection;
  });

  // Kept out of superForm's own `form`/message state — mixing this action's result into that
  // would hand superForm a response shaped nothing like a SuperValidated form.
  let refreshing = $state(false);
  let refreshMessage = $state<string | null>(null);

  let pollTimer: ReturnType<typeof setInterval> | undefined;
  const POLL_INTERVAL_MS = 5_000;
  const POLL_TIMEOUT_MS = 90_000;

  function stopPolling() {
    clearInterval(pollTimer);
    pollTimer = undefined;
  }
  onDestroy(stopPolling);

  // The server action fires the sync and returns immediately (see +page.server.ts) — it can
  // take up to a minute downstream, so this polls for the `updated_at` to actually move rather
  // than pretending a single request/response round trip proves anything.
  function pollForSync(baselineUpdatedAt: string | null) {
    const username = data.bggUsername;
    if (!username) return;
    const start = Date.now();
    stopPolling();
    pollTimer = setInterval(async () => {
      if (Date.now() - start > POLL_TIMEOUT_MS) {
        stopPolling();
        refreshing = false;
        refreshMessage = 'Still syncing — check back in a bit.';
        return;
      }
      try {
        const res = await fetch(`/api/collection?username=${encodeURIComponent(username)}`);
        if (!res.ok) return; // transient — keep polling
        const body = (await res.json()) as { game_ids: number[]; updated_at: string | null };
        if (body.updated_at && body.updated_at !== baselineUpdatedAt) {
          stopPolling();
          refreshing = false;
          refreshMessage = 'Refreshed.';
          collection = { gameCount: body.game_ids.length, updatedAt: body.updated_at };
        }
      } catch {
        // transient — keep polling
      }
    }, POLL_INTERVAL_MS);
  }
</script>

<svelte:head><title>Settings · bgg-viewer</title></svelte:head>

<div class="settings">
  <h1>Settings</h1>

  <div class="panel">
    <section class="row">
      <span class="lbl">Email</span>
      <p class="val">{data.email ?? '—'}</p>
    </section>

    <section class="row">
      <span class="lbl">BGG account</span>
      <form method="POST" action="?/save" use:superEnhance>
        <div class="inline">
          <input
            type="text"
            name="bgg_username"
            placeholder="BGG username"
            autocomplete="off"
            aria-label="BGG username"
            bind:value={$form.bgg_username}
            aria-invalid={$errors.bgg_username ? 'true' : undefined}
          />
          <button class="btn" type="submit" disabled={$submitting}>
            {$submitting ? 'Saving…' : 'Save'}
          </button>
        </div>
        {#if $errors.bgg_username}<p class="note err">{$errors.bgg_username}</p>{/if}
        <!-- Copy note: placeholder — Phil writes final copy. -->
        <p class="note">Links your account for the "My Collection" catalog filter. Leave blank to unlink.</p>
        {#if $message}<p class="note ok">{$message}</p>{/if}
      </form>
    </section>

    {#if collection}
      <section class="row">
        <span class="lbl">Collection sync</span>
        <p class="val">
          {collection.gameCount.toLocaleString()} games{#if collection.updatedAt}
            &nbsp;· last synced {new Date(collection.updatedAt).toLocaleString()}{/if}
        </p>
        <!-- Copy note: placeholder — Phil writes final copy. -->
        <p class="note">
          Fetches fresh from BGG — can take up to a minute. Re-toggle "My Collection" in
          Explore afterward to see it.
        </p>
        <form
          method="POST"
          action="?/refresh"
          use:enhance={() => {
            refreshing = true;
            refreshMessage = 'Refresh started — this can take up to a minute.';
            const baseline = collection?.updatedAt ?? null;
            return async ({ result }) => {
              if (result.type === 'success') {
                pollForSync(baseline);
              } else {
                refreshing = false;
                refreshMessage =
                  (result.type === 'failure' && (result.data?.message as string)) ||
                  'Refresh failed — try again in a moment.';
              }
            };
          }}
        >
          <button class="btn" type="submit" disabled={refreshing}>
            {refreshing ? 'Refreshing…' : 'Refresh from BGG'}
          </button>
        </form>
        {#if refreshMessage}<p class="note">{refreshMessage}</p>{/if}
      </section>
    {/if}
  </div>
</div>

<style>
  .settings { max-width: 28rem; margin: var(--space-xl) auto; }
  .settings h1 { font-size: var(--text-heading); font-weight: 700; margin-bottom: var(--space-lg); }

  /* One surface, hairline-divided rows — matches Rail's `.grp` group convention rather than
     introducing a new "card" motif the rest of the app doesn't otherwise use. */
  .panel { border: 1px solid var(--border); border-radius: var(--radius); overflow: hidden; }
  .row { padding: var(--space-lg); display: flex; flex-direction: column; gap: var(--space-sm); }
  .row + .row { border-top: 1px solid var(--border); }
  .lbl {
    font-size: 0.72rem; text-transform: uppercase; letter-spacing: 0.05em;
    color: var(--muted-foreground); font-weight: 600;
  }
  .val { margin: 0; font-size: 0.95rem; }
  form { margin: 0; display: flex; flex-direction: column; gap: var(--space-sm); }

  .inline { display: flex; gap: var(--space-sm); }
  .inline input {
    flex: 1; min-width: 0;
    border: 1px solid var(--border); border-radius: var(--radius);
    background: var(--background); color: var(--foreground);
    padding: var(--space-sm) var(--space-md); font: inherit; font-size: 0.9rem;
  }
  .inline input:focus-visible { outline: 2px solid var(--primary); outline-offset: 1px; }
  .inline input[aria-invalid='true'] { border-color: var(--color-negative); }

  /* Same bordered-button language as the admin collection picker's "Apply" — this page
     shouldn't invent its own heavier button style just because it lives on its own route. */
  .btn {
    flex: none;
    border: 1px solid var(--border); border-radius: var(--radius);
    background: var(--background); color: var(--primary);
    padding: var(--space-sm) var(--space-md); cursor: pointer;
    font: inherit; font-size: 0.85rem; font-weight: 600;
    white-space: nowrap;
  }
  .btn:hover:not(:disabled) { border-color: var(--primary); }
  .btn:disabled { opacity: 0.5; cursor: default; }

  .note { margin: 0; font-size: 0.8125rem; color: var(--muted-foreground); line-height: 1.4; }
  .note.err { color: var(--color-negative); }
  .note.ok { color: var(--color-positive, var(--primary)); }
</style>
