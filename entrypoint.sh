#!/bin/sh
set -e
# Apply pending Drizzle migrations, then start the production server.
bunx drizzle-kit migrate
exec bun ./dist/server/index.mjs
