#!/bin/sh
set -eu

cd "$(dirname "$0")/.."

: "${DATABASE_URL:?DATABASE_URL must be configured for app seeding}"
: "${DATABASE_DIRECT_URL:?DATABASE_DIRECT_URL must point to a migration-capable database connection}"

node node_modules/prisma/build/index.js migrate deploy --schema packages/prisma/schema.prisma
exec node node_modules/ts-node/dist/bin.js --transpile-only \
  --compiler-options '{"module":"CommonJS","moduleResolution":"node","esModuleInterop":true}' \
  scripts/seed-app-store.ts --require-google-calendar
