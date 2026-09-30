#!/bin/sh
set -eu

cd "$(dirname "$0")/.."

if [ -f built-webapp-url ]; then
  built_webapp_url=$(cat built-webapp-url)
else
  built_webapp_url=${BUILT_NEXT_PUBLIC_WEBAPP_URL:?}
fi
scripts/replace-placeholder.sh "$built_webapp_url" "$NEXT_PUBLIC_WEBAPP_URL"

cd apps/web
export HOSTNAME=0.0.0.0
exec node server.js
