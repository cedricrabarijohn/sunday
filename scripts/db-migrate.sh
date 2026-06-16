#!/usr/bin/env bash
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)/.."
COMPOSE="docker compose --env-file $ROOT/.env -f $ROOT/docker/docker-compose.yml"
MARIADB="$COMPOSE exec -T db sh -c 'mariadb -u root -p\"\$MARIADB_ROOT_PASSWORD\" \"\$MARIADB_DATABASE\"'"

# Run SQL string, return the output
run_sql() {
  echo "$1" | eval "$MARIADB"
}

echo "→ Ensuring __drizzle_migrations table exists…"
run_sql "CREATE TABLE IF NOT EXISTS \`__drizzle_migrations\` (
  \`id\` BIGINT AUTO_INCREMENT PRIMARY KEY,
  \`hash\` text NOT NULL,
  \`created_at\` BIGINT
);" >/dev/null

JOURNAL="$ROOT/drizzle/meta/_journal.json"
ENTRIES=$(node -e "require('$JOURNAL').entries.forEach(e=>console.log(e.tag+' '+e.when));")

while IFS=' ' read -r tag when; do
  SQL_FILE="$ROOT/drizzle/${tag}.sql"
  if [[ ! -f "$SQL_FILE" ]]; then
    echo "  ⚠ $tag.sql not found, skipping"
    continue
  fi

  HASH=$(sha256sum "$SQL_FILE" | cut -d' ' -f1)
  ALREADY=$(run_sql "SELECT COUNT(*) FROM \`__drizzle_migrations\` WHERE \`hash\` = '$HASH';" | tail -1)

  if [[ "$ALREADY" == "1" ]]; then
    echo "  ✓ $tag (already recorded)"
    continue
  fi

  echo "  ↳ Applying $tag…"
  # Capture stderr so we can tell "objects already exist" (DB predates the
  # migration journal) apart from a genuine failure in a brand-new migration.
  set +e
  ERR=$(eval "$MARIADB" < "$SQL_FILE" 2>&1 >/dev/null)
  CODE=$?
  set -e

  if [[ $CODE -eq 0 ]]; then
    echo "    applied."
  elif echo "$ERR" | grep -qiE "already exists|Duplicate column|Duplicate entry|Duplicate key"; then
    echo "    objects already present — marking as applied (baseline)."
  else
    echo "    ✗ failed:"
    echo "$ERR" | sed 's/^/      /'
    exit 1
  fi

  run_sql "INSERT INTO \`__drizzle_migrations\` (\`hash\`, \`created_at\`) VALUES ('$HASH', $when);" >/dev/null
done <<< "$ENTRIES"

echo "→ All migrations applied."
