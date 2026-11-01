#!/usr/bin/env bash
set -euo pipefail

ARCHIVE_FILE="${1:-}"
DB_URI="${MONGODB_URI:-mongodb://localhost:27017/queueless_prod}"

if [[ -z "${ARCHIVE_FILE}" ]]; then
  echo "Error: Path to backup archive file is required."
  echo "Usage: ./restore.sh <path-to-archive-file>"
  exit 1
fi

if [[ ! -f "${ARCHIVE_FILE}" ]]; then
  echo "Error: Archive file not found at ${ARCHIVE_FILE}"
  exit 1
fi

echo "==> Starting QueueLess Database Restore..."
echo "    Archive: ${ARCHIVE_FILE}"
echo "    Target:  ${DB_URI}"

mongorestore --uri="${DB_URI}" --archive="${ARCHIVE_FILE}" --gzip --drop

echo "==> Restore Completed Successfully!"
