# bgg-viewer — local dev tasks
#
# Short verbs over hand-typed pnpm. Recipes are single commands (identical in
# bash / PowerShell); `verify` chains via just's recipe dependencies so it needs
# no shell-specific `&&`.
#
#   just            # list recipes
#   just setup      # install dependencies
#   just dev        # dev server (foreground, Ctrl-C to stop)
#   just dev-bg     # dev server (background)
#   just stop       # stop it, however it was started
#   just status     # is it up?
#   just verify     # types + tests + build (run before every PR)

set windows-shell := ["powershell.exe", "-NoLogo", "-NoProfile", "-Command"]

# Show the recipe list.
default:
    @just --list

# --- Setup / doctor --------------------------------------------------------

# Install dependencies and scaffold .env (safe to re-run).
setup: && env
    pnpm install

# Create .env from .env.example, generating SESSION_SECRET. Never clobbers an existing .env.
env:
    node scripts/setup-env.js

# Print toolchain versions and check local config (env vars, GCP credentials).
doctor:
    node -v
    pnpm -v
    just --version
    node scripts/doctor.js

# --- Operate ---------------------------------------------------------------

# No --open: it resolves the browser through $BROWSER rather than the macOS default handler, so
# it opened the wrong one. Vite prints the URL — click that.
#
# Leading `-` ignores the exit code — Ctrl-C stopping the server is not a failure.
# Run the dev server (http://localhost:5173).
dev:
    -pnpm exec vite dev --port 5173

# Offline: serves the catalog from .cache/catalog.arrow.gz and renders game pages from it, so
# no request reaches BigQuery or the warehouse. Run `just dev` once with network access first
# to populate the cache. Inline `VAR=x cmd` is bash-only, hence the per-platform variants.
# Run the dev server with no network, off the cached catalog.
[unix]
dev-offline:
    -OFFLINE=1 pnpm exec vite dev --port 5173

# Run the dev server with no network, off the cached catalog.
[windows]
dev-offline:
    -$env:OFFLINE = '1'; pnpm exec vite dev --port 5173

# Ctrl-C only works from the terminal that owns the server; killing whatever holds the port
# also reaches one orphaned from its terminal.
#
# try/catch, not -ErrorAction SilentlyContinue: that suppresses the message but still exits
# non-zero, so `just stop` with nothing running reported a failed recipe.
#
# just describes a recipe with the LAST comment line above it, so the description goes last
# and each platform variant repeats it — the listing shows one `stop`, not the rationale.
# Stop the dev server (kills whatever is listening on 5173).
[windows]
stop:
    @try { Get-NetTCPConnection -LocalPort 5173 -State Listen -ErrorAction Stop | ForEach-Object { Stop-Process -Id $_.OwningProcess -Force; "stopped pid $($_.OwningProcess)" } } catch { "nothing listening on 5173" }

# Leading `-`: lsof exits non-zero when it finds nothing, which is not a failure here.
# Stop the dev server (kills whatever is listening on 5173).
[unix]
stop:
    -@lsof -ti tcp:5173 -sTCP:LISTEN | xargs -r kill

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
