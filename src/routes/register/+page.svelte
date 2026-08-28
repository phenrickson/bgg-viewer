<script lang="ts">
  import { superForm } from 'sveltekit-superforms';
  import { untrack } from 'svelte';
  import { zod4 as zod } from 'sveltekit-superforms/adapters';
  import { registerSchema } from '$lib/schemas';
  import { Stack } from '$lib/components/ui/layout';

  let { data } = $props();

  const sf = superForm(untrack(() => data.form), { validators: zod(registerSchema) });
  const { form, errors, enhance, submitting, message } = sf;
</script>

<svelte:head><title>Register · bgg-viewer</title></svelte:head>

<div class="auth">
  <form method="POST" use:enhance>
    <Stack gap="md">
      <h1>Register</h1>

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
        <span>Display name <em>(optional)</em></span>
        <input
          type="text"
          name="display_name"
          autocomplete="nickname"
          bind:value={$form.display_name}
        />
        {#if $errors.display_name}<span class="err">{$errors.display_name}</span>{/if}
      </label>

      <label class="field">
        <!-- Copy note: placeholder — Phil writes final copy. -->
        <span>BGG username <em>(optional)</em></span>
        <input
          type="text"
          name="bgg_username"
          autocomplete="off"
          bind:value={$form.bgg_username}
        />
        {#if $errors.bgg_username}<span class="err">{$errors.bgg_username}</span>{/if}
      </label>

      <label class="field">
        <span>Password</span>
        <input
          type="password"
          name="password"
          autocomplete="new-password"
          bind:value={$form.password}
          aria-invalid={$errors.password ? 'true' : undefined}
        />
        {#if $errors.password}<span class="err">{$errors.password}</span>{/if}
      </label>

      <label class="field">
        <span>Confirm password</span>
        <input
          type="password"
          name="confirm_password"
          autocomplete="new-password"
          bind:value={$form.confirm_password}
          aria-invalid={$errors.confirm_password ? 'true' : undefined}
        />
        {#if $errors.confirm_password}<span class="err">{$errors.confirm_password}</span>{/if}
      </label>

      <label class="field">
        <span>Registration code</span>
        <input
          type="text"
          name="registration_code"
          autocomplete="off"
          bind:value={$form.registration_code}
          aria-invalid={$errors.registration_code ? 'true' : undefined}
        />
        {#if $errors.registration_code}<span class="err">{$errors.registration_code}</span>{/if}
      </label>

      <button class="submit" type="submit" disabled={$submitting}>
        {$submitting ? 'Creating account…' : 'Register'}
      </button>

      <p class="alt">Already have an account? <a href="/login">Log in</a></p>
    </Stack>
  </form>
</div>

<style>
  .auth { max-width: 24rem; margin: var(--space-xl) auto; }
  .auth h1 { font-size: var(--text-heading); font-weight: 700; }
  form { margin: 0; }
  .field { display: flex; flex-direction: column; gap: var(--space-sm); }
  .field > span { font-size: 0.875rem; color: var(--muted-foreground); }
  .field > span em { font-style: normal; opacity: 0.7; }
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
