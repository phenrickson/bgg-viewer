<script lang="ts">
  /**
   * A two-handle range slider for the rail's numeric filters.
   *
   * Two overlaid native `<input type="range">` rather than a hand-rolled pointer drag. The
   * strip's histogram brush is the hand-rolled kind and is deliberately *not* keyboard-operable
   * (`MiniHistogram` calls itself "a labelled image, not a control"), which was acceptable only
   * because the rail's typed number inputs were the accessible path to the same fields. This
   * control replaces those inputs, so it has to carry that path itself — and native inputs give
   * arrow keys, Home/End, focus rings and screen-reader announcement for free.
   *
   * Generic over `domain` / `step` / `format`: it knows nothing about complexity or about
   * `Scope`. The nullable-bounds translation lives in `range.ts`.
   *
   * **Currently unused, on purpose.** It was built for complexity, which then went to band
   * checkboxes (a set control, not a span control), and year took steppers. Kept because the
   * rail still has four typed min/max pairs under "Exact numbers" — rating, ratings count and
   * geek rating are all genuine spans that a slider would serve better than two text fields.
   * `range.test.ts` covers the bounds logic, so it stays honest while it waits.
   */
  import { toBounds, toHandles, type Domain } from './range';

  let {
    min = $bindable(),
    max = $bindable(),
    domain,
    step = 0.1,
    label,
    loLabel,
    hiLabel,
    format = String
  }: {
    /** Lower bound; `null` means unbounded. */
    min: number | null;
    /** Upper bound; `null` means unbounded. */
    max: number | null;
    domain: Domain;
    step?: number;
    /** Accessible name, e.g. "complexity" — each handle announces as "<label> minimum/maximum". */
    label: string;
    /** Words under the track's ends, e.g. "light" / "heavy". Omit for none. */
    loLabel?: string;
    hiLabel?: string;
    format?: (n: number) => string;
  } = $props();

  // The handles mirror the bounds, with nulls parked at the domain's edges. Derived rather than
  // copied into state so a scope change from anywhere else — the strip's brush, a pasted URL,
  // the chips' ✕ — moves the handles without a syncing effect.
  const handles = $derived(toHandles(min, max, domain));

  /**
   * Which input sits on top. Both span the full track so either handle can be grabbed anywhere,
   * which means the one you want can be underneath — raising the nearest on pointerdown is what
   * lets the handles cross instead of jamming at each other.
   */
  let front = $state<'lo' | 'hi'>('hi');
  let track = $state<HTMLElement | null>(null);

  /**
   * Raise whichever handle the pointer landed nearest. Fires from the thumbs (the only part of
   * these inputs that takes pointer events), which is exactly when it matters: grabbing a thumb
   * that happens to be sitting underneath its sibling.
   */
  function nearest(e: PointerEvent) {
    if (!track) return;
    const { left, width } = track.getBoundingClientRect();
    if (!width) return;
    const at = domain.lo + ((e.clientX - left) / width) * (domain.hi - domain.lo);
    front = Math.abs(at - handles.lo) <= Math.abs(at - handles.hi) ? 'lo' : 'hi';
  }

  const commit = (lo: number, hi: number) => {
    const b = toBounds(lo, hi, domain, step);
    min = b.min;
    max = b.max;
  };
</script>

<div class="track" bind:this={track}>
  <div class="rail-line" aria-hidden="true"></div>
  <!-- The selected span, drawn from the handle positions. -->
  <div
    class="fill"
    aria-hidden="true"
    style:left="{((handles.lo - domain.lo) / (domain.hi - domain.lo)) * 100}%"
    style:right="{100 - ((handles.hi - domain.lo) / (domain.hi - domain.lo)) * 100}%"
  ></div>

  <input
    class="thumb"
    class:front={front === 'lo'}
    type="range"
    onpointerdown={nearest}
    min={domain.lo}
    max={domain.hi}
    {step}
    value={handles.lo}
    aria-label="{label} minimum"
    aria-valuetext={min == null ? 'no minimum' : format(min)}
    oninput={(e) => commit(e.currentTarget.valueAsNumber, handles.hi)}
  />
  <input
    class="thumb"
    class:front={front === 'hi'}
    type="range"
    onpointerdown={nearest}
    min={domain.lo}
    max={domain.hi}
    {step}
    value={handles.hi}
    aria-label="{label} maximum"
    aria-valuetext={max == null ? 'no maximum' : format(max)}
    oninput={(e) => commit(handles.lo, e.currentTarget.valueAsNumber)}
  />
</div>

{#if loLabel || hiLabel}
  <div class="ends">
    <span>{loLabel ?? ''}</span>
    <span>{hiLabel ?? ''}</span>
  </div>
{/if}

<style>
  .track {
    position: relative;
    height: 1.1rem;
    display: flex;
    align-items: center;
  }

  /* Not `.rail` — that's the <aside> this lives in. */
  .rail-line,
  .fill {
    position: absolute;
    height: 4px;
    border-radius: 999px;
    pointer-events: none;
  }
  .rail-line {
    left: 0;
    right: 0;
    background: var(--border);
  }
  .fill {
    background: var(--primary);
  }

  /*
   * Both inputs stack on the same line with transparent tracks, so only the two thumbs are
   * visible over the shared rail drawn above. `pointer-events: none` on the input with `auto`
   * on the thumb keeps the *un*-raised input from swallowing clicks aimed at its sibling.
   */
  .thumb {
    position: absolute;
    left: 0;
    width: 100%;
    margin: 0;
    background: none;
    appearance: none;
    -webkit-appearance: none;
    pointer-events: none;
    z-index: 1;
  }
  .thumb.front {
    z-index: 2;
  }

  .thumb::-webkit-slider-runnable-track {
    background: none;
    height: 1.1rem;
  }
  .thumb::-moz-range-track {
    background: none;
    height: 1.1rem;
  }

  .thumb::-webkit-slider-thumb {
    appearance: none;
    -webkit-appearance: none;
    pointer-events: auto;
    width: 0.85rem;
    height: 0.85rem;
    border-radius: 50%;
    border: 1px solid var(--primary);
    background: var(--background);
    cursor: grab;
  }
  .thumb::-moz-range-thumb {
    pointer-events: auto;
    width: 0.85rem;
    height: 0.85rem;
    border-radius: 50%;
    border: 1px solid var(--primary);
    background: var(--background);
    cursor: grab;
  }
  .thumb:active::-webkit-slider-thumb {
    cursor: grabbing;
    background: var(--primary);
  }
  .thumb:active::-moz-range-thumb {
    cursor: grabbing;
    background: var(--primary);
  }

  /* The whole input is the focus target, so ring the thumb rather than the full-width box. */
  .thumb:focus-visible {
    outline: none;
  }
  .thumb:focus-visible::-webkit-slider-thumb {
    outline: 2px solid var(--primary);
    outline-offset: 2px;
  }
  .thumb:focus-visible::-moz-range-thumb {
    outline: 2px solid var(--primary);
    outline-offset: 2px;
  }

  .ends {
    display: flex;
    justify-content: space-between;
    font-size: 0.66rem;
    color: var(--muted-foreground);
  }
</style>
