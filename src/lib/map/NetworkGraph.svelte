<script lang="ts">
  /** An ego network on its own canvas: `PointCanvas` + `NetworkLayer`. See `EmbeddingMap`. */
  import type { ComponentProps } from 'svelte';
  import PointCanvas from './PointCanvas.svelte';
  import NetworkLayer from './NetworkLayer.svelte';

  let {
    mode = 'pan',
    cameraFixed = false,
    interactive = true,
    frame = true,
    ...layer
  }: ComponentProps<typeof PointCanvas> & ComponentProps<typeof NetworkLayer> = $props();
</script>

<PointCanvas {mode} {cameraFixed} {interactive} {frame}>
  <NetworkLayer {...layer} />
</PointCanvas>
