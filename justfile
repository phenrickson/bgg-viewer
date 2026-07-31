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
# Leading `-` ignores the exit code — Ctrl-C stopping the server is not a failure.
dev:
    -pnpm exec vite dev --open --port 5173

# Stop the dev server. Ctrl-C only works from the terminal that owns it; this kills whatever
# holds the port, so it also reaches a server orphaned from its terminal.
# try/catch, not -ErrorAction SilentlyContinue: that suppresses the message but still exits
# non-zero, so `just stop` with nothing running reported a failed recipe.
[windows]
stop:
    @try { Get-NetTCPConnection -LocalPort 5173 -State Listen -ErrorAction Stop | ForEach-Object { Stop-Process -Id $_.OwningProcess -Force; "stopped pid $($_.OwningProcess)" } } catch { "nothing listening on 5173" }

# Leading `-`: lsof exits non-zero when it finds nothing, which is not a failure here.
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
