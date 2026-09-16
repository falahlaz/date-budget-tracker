#!/usr/bin/env bash
# Dumps the database and the receipt storage folder into one dated archive.
set -euo pipefail

STAMP="$(date +%Y%m%d-%H%M%S)"
OUT_DIR="${BACKUP_DIR:-./backups}"
STORAGE_ROOT="${STORAGE_ROOT:-./storage}"
WORK_DIR="$(mktemp -d)"

trap 'rm -rf "$WORK_DIR"' EXIT

if [[ -z "${DATABASE_URL:-}" ]]; then
  if [[ -f .env ]]; then
    set -a; source .env; set +a
  fi
fi

if [[ -z "${DATABASE_URL:-}" ]]; then
  echo "DATABASE_URL is not set" >&2
  exit 1
fi

# mysql://user:pass@host:port/db
proto_removed="${DATABASE_URL#mysql://}"
credentials="${proto_removed%%@*}"
location="${proto_removed#*@}"
DB_USER="${credentials%%:*}"
DB_PASS="${credentials#*:}"
hostport="${location%%/*}"
DB_NAME="${location#*/}"
DB_NAME="${DB_NAME%%\?*}"
DB_HOST="${hostport%%:*}"
DB_PORT="${hostport#*:}"
[[ "$DB_PORT" == "$DB_HOST" ]] && DB_PORT=3306

mkdir -p "$OUT_DIR"

echo "[backup] dumping database $DB_NAME..."
mysqldump --host="$DB_HOST" --port="$DB_PORT" --user="$DB_USER" --password="$DB_PASS" \
  --single-transaction --routines --triggers "$DB_NAME" > "$WORK_DIR/database.sql"

echo "[backup] collecting receipts from $STORAGE_ROOT..."
mkdir -p "$WORK_DIR/storage"
if [[ -d "$STORAGE_ROOT" ]]; then
  cp -a "$STORAGE_ROOT/." "$WORK_DIR/storage/"
fi

ARCHIVE="$OUT_DIR/budget-tracker-backup-$STAMP.tar.gz"
tar -czf "$ARCHIVE" -C "$WORK_DIR" database.sql storage

echo "[backup] done -> $ARCHIVE"
