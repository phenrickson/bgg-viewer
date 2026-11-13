<script lang="ts">
  /** Add a game to / remove it from the focus list. A ghost icon `Button` + lucide Star. */
  import { Button } from '$lib/components/ui/button';
  import StarIcon from '@lucide/svelte/icons/star';
  import { stars } from '$lib/bggcon/stars.svelte';

  let { id, name }: { id: number; name: string } = $props();
  const on = $derived(stars.has(id));
</script>

<Button
  variant="ghost"
  size="icon-sm"
  aria-pressed={on}
  aria-label={on ? `Remove ${name} from your focus list` : `Add ${name} to your focus list`}
  class={on ? 'text-primary' : 'text-muted-foreground'}
  onclick={() => stars.toggle(id)}
>
  <StarIcon fill={on ? 'currentColor' : 'none'} aria-hidden="true" />
</Button>
