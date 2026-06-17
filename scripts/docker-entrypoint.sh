#!/bin/sh
set -e

echo "=== wemembers Entrypoint ==="
echo "NODE_ENV=${NODE_ENV}"

echo "Waiting for PostgreSQL..."
RETRY=0
MAX_RETRIES=30
while [ ${RETRY} -lt ${MAX_RETRIES} ]; do
  # TCP check to DB host
  node -e "
    var net = require('net');
    var url = process.env.DATABASE_URL || '';
    var m = url.match(/@([^:]+):(\d+)/);
    var host = m ? m[1] : 'wemembers_db';
    var port = m ? parseInt(m[2]) : 5432;
    var s = new net.Socket();
    s.setTimeout(3000);
    s.connect(port, host, function() { s.destroy(); process.exit(0); });
    s.on('error', function() { process.exit(1); });
    s.on('timeout', function() { process.exit(1); });
  " 2>/dev/null && break

  RETRY=$((RETRY + 1))
  echo "  Retry ${RETRY}/${MAX_RETRIES}..."
  sleep 2
done

if [ ${RETRY} -ge ${MAX_RETRIES} ]; then
  echo "WARNING: Database not reachable, starting anyway..."
fi

echo "Starting server..."
exec node server.js
