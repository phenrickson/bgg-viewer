# bgg-viewer — local dev tasks
#
# Short verbs over hand-typed pnpm. Recipes are single commands (identical in
# bash / PowerShell); `verify` chains via just's recipe dependencies so it needs
# no shell-specific `&&`.
#
#   just            # list recipes
#   just setup      # install dependencies
#   just dev        # dev server
#   just verify     # types + tests + build (run before every PR)

set windows-shell := ["powershell.exe", "-NoLogo", "-NoProfile", "-Command"]

# Show the recipe list.
default:
    @just --list

# --- Setup / doctor --------------------------------------------------------

# Install dependencies.
setup:
    pnpm install

# Print toolchain versions (sanity check the environment).
doctor:
    node -v
    pnpm -v
    just --version

# --- Operate ---------------------------------------------------------------

# Run the dev server (auto-opens the browser on a pinned port).
dev:
    pnpm dev -- --open --port 5173

# Type-check (svelte-check).
check:
    pnpm run check

# Unit tests (vitest, single run).
test:
    pnpm test

# Watch tests.
test-watch:
    pnpm run test:unit

# Production build (adapter-node).
build:
    pnpm build

# Serve the built adapter-node server (PORT env overrides; default 3000).
start:
    node build/index.js

# --- Gates -----------------------------------------------------------------

# Full pre-PR gate: types, then tests, then build. Run this before opening a PR.
verify: check test build

# --- Cleanup ---------------------------------------------------------------

# Remove generated artifacts (keeps source + node_modules). Portable via node.
clean:
    node -e "for (const d of ['.svelte-kit','build']) require('fs').rmSync(d,{recursive:true,force:true})"
