<script lang="ts">
  /**
   * The embedding map, self-contained: a `PointCanvas` with a `MapLayer` inside. This is
   * what a page uses when it only wants the map. A page that wants to move between the map
   * and another arrangement of the same points (the ego network) mounts its own
   * `PointCanvas` and swaps the layer inside it — see `/dev/map/network`.
   */
  import type { ComponentProps } from 'svelte';
  import PointCanvas from './PointCanvas.svelte';
  import MapLayer from './MapLayer.svelte';

  let {
    mode = 'pan',
    cameraFixed = false,
    interactive = true,
    frame = true,
    lasso = true,
    api = $bindable(null),
    ...layer
  }: ComponentProps<typeof PointCanvas> & ComponentProps<typeof MapLayer> = $props();
</script>

<PointCanvas {mode} {cameraFixed} {interactive} {frame} {lasso} bind:api>
  <MapLayer {...layer} />
</PointCanvas>
