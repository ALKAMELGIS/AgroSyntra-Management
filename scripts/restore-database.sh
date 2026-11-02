#!/bin/bash
#
# Database Restore Script
# Usage: ./restore-database.sh <backup_file> [target_database]
#
# Environment variables required:
# - POSTGRES_HOST
# - POSTGRES_PORT (default: 5432)
# - POSTGRES_USER
# - POSTGRES_PASSWORD
#
# WARNING: This will DROP and recreate the target database!
#

set -euo pipefail

BACKUP_FILE="$1"
TARGET_DB="${2:-almahafarm_restored}"
POSTGRES_HOST="${POSTGRES_HOST:-localhost}"
POSTGRES_PORT="${POSTGRES_PORT:-5432}"
POSTGRES_USER="${POSTGRES_USER:-almaha}"

if [ -z "${BACKUP_FILE}" ]; then
    echo "Usage: $0 <backup_file> [target_database]"
    echo ""
    echo "Available backups:"
    ls -lh /backups/*.sql.gz 2>/dev/null || echo "No backups found in /backups/"
    exit 1
fi

if [ ! -f "${BACKUP_FILE}" ]; then
    echo "ERROR: Backup file not found: ${BACKUP_FILE}"
    exit 1
fi

echo "================================================"
echo "Database Restore"
echo "================================================"
echo "Backup file: ${BACKUP_FILE}"
echo "Target database: ${TARGET_DB}"
echo "Host: ${POSTGRES_HOST}:${POSTGRES_PORT}"
echo ""
echo "WARNING: This will DROP the database '${TARGET_DB}' if it exists!"
read -p "Are you sure you want to continue? (yes/no): " CONFIRM

if [ "${CONFIRM}" != "yes" ]; then
    echo "Restore cancelled"
    exit 0
fi

export PGPASSWORD="${POSTGRES_PASSWORD}"

# Terminate existing connections
echo "Terminating existing connections to ${TARGET_DB}..."
psql -h "${POSTGRES_HOST}" -p "${POSTGRES_PORT}" -U "${POSTGRES_USER}" -d postgres -c "
    SELECT pg_terminate_backend(pid)
    FROM pg_stat_activity
    WHERE datname = '${TARGET_DB}' AND pid <> pg_backend_pid();
" 2>/dev/null || true

# Drop and recreate database
echo "Dropping database ${TARGET_DB}..."
psql -h "${POSTGRES_HOST}" -p "${POSTGRES_PORT}" -U "${POSTGRES_USER}" -d postgres -c "DROP DATABASE IF EXISTS \"${TARGET_DB}\";"

echo "Creating database ${TARGET_DB}..."
psql -h "${POSTGRES_HOST}" -p "${POSTGRES_PORT}" -U "${POSTGRES_USER}" -d postgres -c "CREATE DATABASE \"${TARGET_DB}\";"

# Enable PostGIS extension
echo "Enabling PostGIS extension..."
psql -h "${POSTGRES_HOST}" -p "${POSTGRES_PORT}" -U "${POSTGRES_USER}" -d "${TARGET_DB}" -c "CREATE EXTENSION IF NOT EXISTS postgis;"
psql -h "${POSTGRES_HOST}" -p "${POSTGRES_PORT}" -U "${POSTGRES_USER}" -d "${TARGET_DB}" -c 'CREATE EXTENSION IF NOT EXISTS "uuid-ossp";'

# Restore backup
echo "Restoring backup..."
gunzip -c "${BACKUP_FILE}" | psql -h "${POSTGRES_HOST}" -p "${POSTGRES_PORT}" -U "${POSTGRES_USER}" -d "${TARGET_DB}"

echo ""
echo "Restore completed successfully!"
echo ""

# Show table counts
echo "Table row counts:"
psql -h "${POSTGRES_HOST}" -p "${POSTGRES_PORT}" -U "${POSTGRES_USER}" -d "${TARGET_DB}" -c "
    SELECT 
        schemaname,
        relname as table_name,
        n_live_tup as row_count
    FROM pg_stat_user_tables
    ORDER BY n_live_tup DESC;
"
