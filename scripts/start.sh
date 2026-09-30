#!/bin/sh
set -eu

cd "$(dirname "$0")/.."

# Replace the statically built BUILT_NEXT_PUBLIC_WEBAPP_URL with run-time NEXT_PUBLIC_WEBAPP_URL
# NOTE: if these values are the same, this will be skipped.
scripts/replace-placeholder.sh "$BUILT_NEXT_PUBLIC_WEBAPP_URL" "$NEXT_PUBLIC_WEBAPP_URL"

cd apps/web
exec node ../../node_modules/next/dist/bin/next start --hostname 0.0.0.0 --port "${PORT:-3000}"
