#!/usr/bin/env bash
# Foreground local launcher. No Arena, npm install, daemon, or browser automation.
set -euo pipefail
SCRIPT_DIR="$(CDPATH= cd -- "$(dirname -- "${BASH_SOURCE[0]}")" && pwd -P)"
if ! command -v node >/dev/null 2>&1; then
  printf '%s\n' 'PassGuard requires Node.js 20+ on this computer. Install a supported Node LTS, then retry.' >&2
  exit 127
fi
if [[ ! -f "$SCRIPT_DIR/scripts/dev-server.mjs" ]]; then
  printf '%s\n' 'Cannot find scripts/dev-server.mjs. Run this launcher from the complete existing PassGuard project.' >&2
  exit 1
fi
cd -- "$SCRIPT_DIR"
# Pin safe local defaults even if the shell exports HOST/PORT. Explicit user
# arguments below may override these, e.g. --no-open or --port 8000.
exec node "$SCRIPT_DIR/scripts/dev-server.mjs" --host 127.0.0.1 --port 3000 --open "$@"
