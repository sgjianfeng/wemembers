#!/bin/bash
# Run this from the SERVER (/root/wemembers) to push the Prisma schema to PostgreSQL
# Usage: bash scripts/db-migrate.sh

set -e

echo "🔧 Running Prisma DB Push..."

# Check if we're inside the container or on the host
if [ -f /.dockerenv ]; then
    # Inside container - use local prisma
    npx prisma@5 db push --skip-generate
else
    # On Docker host - exec into the wemembers container
    cd /root/wemembers
    docker compose -f docker-compose.prod.yml exec -T wemembers \
        npx prisma@5 db push --skip-generate --accept-data-loss
fi

echo "✅ DB migration complete"
