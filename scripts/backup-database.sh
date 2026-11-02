#!/bin/bash
#
# Database Backup Script
# Usage: ./backup-database.sh [daily|weekly|manual]
#
# Environment variables required:
# - POSTGRES_HOST
# - POSTGRES_PORT (default: 5432)
# - POSTGRES_USER
# - POSTGRES_PASSWORD
# - POSTGRES_DB
# - BACKUP_DIR (default: /backups)
# - S3_BUCKET (optional, for S3 upload)
#

set -euo pipefail

# Configuration
BACKUP_TYPE="${1:-daily}"
POSTGRES_HOST="${POSTGRES_HOST:-localhost}"
POSTGRES_PORT="${POSTGRES_PORT:-5432}"
POSTGRES_USER="${POSTGRES_USER:-almaha}"
POSTGRES_DB="${POSTGRES_DB:-almahafarm}"
BACKUP_DIR="${BACKUP_DIR:-/backups}"
TIMESTAMP=$(date +%Y%m%d_%H%M%S)
BACKUP_FILE="${BACKUP_DIR}/${POSTGRES_DB}_${BACKUP_TYPE}_${TIMESTAMP}.sql.gz"

# Retention policies (days)
DAILY_RETENTION=7
WEEKLY_RETENTION=30
MANUAL_RETENTION=90

echo "Starting database backup..."
echo "Database: ${POSTGRES_DB}"
echo "Host: ${POSTGRES_HOST}:${POSTGRES_PORT}"
echo "Backup file: ${BACKUP_FILE}"

# Create backup directory if it doesn't exist
mkdir -p "${BACKUP_DIR}"

# Perform backup
export PGPASSWORD="${POSTGRES_PASSWORD}"
pg_dump \
    -h "${POSTGRES_HOST}" \
    -p "${POSTGRES_PORT}" \
    -U "${POSTGRES_USER}" \
    -d "${POSTGRES_DB}" \
    --no-owner \
    --no-acl \
    --format=plain \
    | gzip > "${BACKUP_FILE}"

# Verify backup
if [ -f "${BACKUP_FILE}" ] && [ -s "${BACKUP_FILE}" ]; then
    BACKUP_SIZE=$(du -h "${BACKUP_FILE}" | cut -f1)
    echo "Backup completed successfully: ${BACKUP_FILE} (${BACKUP_SIZE})"
else
    echo "ERROR: Backup failed or file is empty"
    exit 1
fi

# Upload to S3 if configured
if [ -n "${S3_BUCKET:-}" ]; then
    echo "Uploading to S3: s3://${S3_BUCKET}/backups/"
    aws s3 cp "${BACKUP_FILE}" "s3://${S3_BUCKET}/backups/" --storage-class STANDARD_IA
    echo "S3 upload completed"
fi

# Cleanup old backups based on retention policy
cleanup_old_backups() {
    local pattern="$1"
    local retention_days="$2"
    
    echo "Cleaning up backups older than ${retention_days} days matching pattern: ${pattern}"
    find "${BACKUP_DIR}" -name "${pattern}" -mtime "+${retention_days}" -delete 2>/dev/null || true
}

case "${BACKUP_TYPE}" in
    daily)
        cleanup_old_backups "${POSTGRES_DB}_daily_*.sql.gz" "${DAILY_RETENTION}"
        ;;
    weekly)
        cleanup_old_backups "${POSTGRES_DB}_weekly_*.sql.gz" "${WEEKLY_RETENTION}"
        ;;
    manual)
        cleanup_old_backups "${POSTGRES_DB}_manual_*.sql.gz" "${MANUAL_RETENTION}"
        ;;
esac

echo "Backup process completed"

# List current backups
echo ""
echo "Current backups:"
ls -lh "${BACKUP_DIR}/${POSTGRES_DB}_"*.sql.gz 2>/dev/null || echo "No backups found"
