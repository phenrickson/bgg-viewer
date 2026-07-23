---
name: style-rules
description: Use when choosing colors, palettes, themes, chart colors, or dark-mode styling. Covers semantic status tokens, accessible chart palettes, dark-mode discipline, and the CSS-variable-not-hardcoded rule.
---

# Style Rules

Portable color and theming rules for a token-driven Tailwind v4 app. Define your
own brand palette; these rules constrain any palette you pick.

## Define brand tokens, reference them everywhere

Declare colors as OKLCH custom properties in `app.css`; components reference
`var(--token)` / Tailwind theme classes — **never** hardcoded hex or `hsl()`.

```svelte
<!-- Good -->
<Button>Primary Action</Button>
<div class="bg-primary text-primary-foreground">Themed</div>
<span class="text-positive">+$12,500</span>
<!-- Avoid -->
<div class="bg-[#008a89]">Hardcoded</div>
```

## Text color conventions

- **Headings**: `text-foreground`
- **Body text**: `text-muted-foreground`
- **Links / actions**: `text-primary`

## Semantic status colors

Give business meaning its own tokens (not raw palette slots) so meaning stays
consistent across charts, badges, indicators. Define light + dark values for each:

| Meaning | Token | Note |
|---|---|---|
| Positive / revenue | `--color-positive` | |
| High priority | `--color-priority` | |
| Projected / open | `--color-projected` | |
| Negative / loss | `--color-negative` | |

Always supplement status color with an icon or label — never color alone.

## Chart palette rules

A 5-series categorical palette referenced as `var(--chart-1..5)`:

- **Max 5–7 colors per chart** — more overwhelms.
- **Blue + amber/orange is the colorblind-safe gold-standard pair.** Build 2-color
  charts from it.
- **No red-vs-green pairs** — inaccessible to red-green colorblindness.
- **Fills stay above lightness 0.55** to keep a 3:1 contrast ratio on white.
- **Single-metric charts** (trends, heatmaps): sequential shades of one hue.
- **Multi-category charts:** the distinct-hue categorical palette.
- **Never rely on color alone** — add labels, tooltips, patterns, or icons.

## Dark mode

- Toggle a `.dark` class on the root (e.g. via `mode-watcher`).
- Define dark overrides of the same tokens; components never branch on theme.
- **Always test both light and dark** when adding or changing UI.

## Anti-patterns

- Hardcoded hex/hsl in components — use tokens.
- Color as the only signal — always pair with text/icon/pattern.
- Red-vs-green encodings.
- Chart fills below lightness 0.55 on light backgrounds (fails contrast).
