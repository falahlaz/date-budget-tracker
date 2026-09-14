#!/usr/bin/env bash
# Applies a migration's down.sql (PRD v2 section 9.1, test M2).
#
# Prisma has no native down migration, so the reverse DDL is a hand-written file applied
# by the mysql client. This script only carries it to the server -- the safety rules live
# in down.sql itself, which refuses to run when rolling back would lose rows.
#
#   npm run migrate:down                        # the latest migration
#   npm run migrate:down 20260914120000_wallets_and_transactions
#
# Afterwards the migration is still recorded as applied in `_prisma_migrations`. That row
# is deleted too, so `prisma migrate deploy` will re-apply the migration rather than
# believing the database is already up to date.
set -euo pipefail

MIGRATIONS_DIR="prisma/migrations"

if [[ -z "${DATABASE_URL:-}" && -f .env ]]; then
  set -a; source .env; set +a
fi

if [[ -z "${DATABASE_URL:-}" ]]; then
  echo "DATABASE_URL is not set" >&2
  exit 1
fi

MIGRATION="${1:-}"
if [[ -z "$MIGRATION" ]]; then
  # Migration directories are timestamp-prefixed, so the last one by name is the newest.
  MIGRATION="$(find "$MIGRATIONS_DIR" -mindepth 1 -maxdepth 1 -type d -printf '%f\n' | sort | tail -1)"
fi

DOWN_FILE="$MIGRATIONS_DIR/$MIGRATION/down.sql"

if [[ ! -f "$DOWN_FILE" ]]; then
  echo "no down.sql for migration '$MIGRATION' (looked in $DOWN_FILE)" >&2
  echo "migrations that have one:" >&2
  find "$MIGRATIONS_DIR" -name down.sql -printf '  %h\n' >&2
  exit 1
fi

# mysql://user:pass@host:port/db -- same parsing as scripts/backup.sh
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

mysql_run() {
  mysql --host="$DB_HOST" --port="$DB_PORT" --user="$DB_USER" --password="$DB_PASS" "$DB_NAME" "$@"
}

echo "[migrate:down] rolling back $MIGRATION on $DB_NAME@$DB_HOST:$DB_PORT"
echo "[migrate:down] make sure you have a dump -- run 'npm run backup' first if you do not."

# No --force: the first error stops the script, which is what makes down.sql's guards work.
mysql_run < "$DOWN_FILE"

echo "[migrate:down] schema rolled back"

mysql_run -e "DELETE FROM \`_prisma_migrations\` WHERE \`migration_name\` = '$MIGRATION';" 2>/dev/null \
  && echo "[migrate:down] removed $MIGRATION from _prisma_migrations" \
  || echo "[migrate:down] note: could not update _prisma_migrations (table may not exist)"

echo "[migrate:down] done"
