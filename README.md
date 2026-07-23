# bgg-viewer

A SvelteKit front-end for BGG data — flexible catalog browse/search plus model
enrichments (predictions, similarity, embeddings). Consumes the decoupled
warehouse read API in `bgg-data-warehouse`. Eventually replaces `bgg-dash-viewer`.

Built from the conventions in the `front-end-design` starter kit (copied into
`.claude/skills/` and owned here). Stack: SvelteKit 2 (SSR, adapter-node),
Tailwind v4 + OKLCH tokens, Svelte 5 runes, TanStack, LayerChart.

## Develop

```sh
corepack enable            # or ensure pnpm is on PATH
pnpm install
pnpm dev                   # dev server
pnpm check                 # svelte-check (types)
pnpm test                  # vitest unit tests
pnpm build                 # production build (adapter-node)
```

## Docs

- Design: [docs/superpowers/specs/](docs/superpowers/specs/)
- Plan: [docs/superpowers/plans/](docs/superpowers/plans/)
