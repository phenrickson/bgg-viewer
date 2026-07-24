<script lang="ts">
  import { superForm } from 'sveltekit-superforms';
  import { untrack } from 'svelte';
  import { zod4 as zod } from 'sveltekit-superforms/adapters';
  import { loginSchema } from '$lib/schemas';
  import { Stack } from '$lib/components/ui/layout';

  let { data } = $props();

  // superForm reads data.form once at init — intentionally non-reactive.
  const sf = superForm(untrack(() => data.form), { validators: zod(loginSchema) });
  const { form, errors, enhance, submitting, message } = sf;
</script>

<svelte:head><title>Log in · bgg-viewer</title></svelte:head>

<div class="auth">
  <form method="POST" use:enhance>
    <Stack gap="md">
      <h1>Log in</h1>

      {#if $message}
        <p class="banner" role="alert">{$message}</p>
      {/if}

      <label class="field">
        <span>Email</span>
        <input
          type="email"
          name="email"
          autocomplete="email"
          bind:value={$form.email}
          aria-invalid={$errors.email ? 'true' : undefined}
        />
        {#if $errors.email}<span class="err">{$errors.email}</span>{/if}
      </label>

      <label class="field">
        <span>Password</span>
        <input
          type="password"
          name="password"
          autocomplete="current-password"
          bind:value={$form.password}
          aria-invalid={$errors.password ? 'true' : undefined}
        />
        {#if $errors.password}<span class="err">{$errors.password}</span>{/if}
      </label>

      <button class="submit" type="submit" disabled={$submitting}>
        {$submitting ? 'Signing in…' : 'Log in'}
      </button>

      <p class="alt">No account? <a href="/register">Register</a></p>
    </Stack>
  </form>
</div>

<style>
  .auth { max-width: 24rem; margin: var(--space-xl) auto; }
  .auth h1 { font-size: var(--text-heading); font-weight: 700; }
  form { margin: 0; }
  .field { display: flex; flex-direction: column; gap: var(--space-sm); }
  .field > span { font-size: 0.875rem; color: var(--muted-foreground); }
  .field input {
    border: 1px solid var(--border); border-radius: var(--radius);
    background: var(--background); color: var(--foreground);
    padding: var(--space-sm) var(--space-md); font: inherit;
  }
  .field input:focus-visible { outline: 2px solid var(--primary); outline-offset: 1px; }
  .field input[aria-invalid='true'] { border-color: var(--color-negative); }
  .err { font-size: 0.8125rem; color: var(--color-negative); }
  .banner {
    border: 1px solid var(--color-negative); border-radius: var(--radius);
    background: color-mix(in oklch, var(--color-negative) 10%, transparent);
    color: var(--color-negative); padding: var(--space-sm) var(--space-md); font-size: 0.875rem;
  }
  .submit {
    border: none; border-radius: var(--radius); cursor: pointer;
    background: var(--primary); color: var(--primary-foreground);
    padding: var(--space-sm) var(--space-md); font: inherit; font-weight: 600;
  }
  .submit:disabled { opacity: 0.6; cursor: default; }
  .alt { font-size: 0.875rem; color: var(--muted-foreground); }
  .alt a { color: var(--primary); }
</style>
