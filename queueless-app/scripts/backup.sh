#!/usr/bin/env bash
set -euo pipefail

DB_URI="${MONGODB_URI:-mongodb://localhost:27017/queueless_prod}"
BACKUP_DIR="${BACKUP_DIR:-backups}"
TIMESTAMP=$(date +"%Y%m%d_%H%M%S")
ARCHIVE_FILE="${BACKUP_DIR}/queueless_backup_${TIMESTAMP}.archive"

mkdir -p "${BACKUP_DIR}"

echo "==> Starting QueueLess Database Backup..."
echo "    Target URI: ${DB_URI}"
echo "    Archive:    ${ARCHIVE_FILE}"

mongodump --uri="${DB_URI}" --archive="${ARCHIVE_FILE}" --gzip

echo "==> Backup Succeeded! $(ls -lh "${ARCHIVE_FILE}")"

