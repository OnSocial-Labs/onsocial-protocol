#!/bin/bash
# =============================================================================
# Create additional Postgres databases on first boot.
# Mounted into /docker-entrypoint-initdb.d/ — runs once per data volume.
# =============================================================================
set -e

# Create the rewards backend database if it doesn't exist
psql -v ON_ERROR_STOP=1 --username "$POSTGRES_USER" --dbname "$POSTGRES_DB" <<-EOSQL
    SELECT 'CREATE DATABASE onsocial_backend OWNER $POSTGRES_USER'
    WHERE NOT EXISTS (SELECT FROM pg_database WHERE datname = 'onsocial_backend')\gexec
EOSQL

echo "✅ Extra databases initialized"
