#!/usr/bin/env bash
set -euo pipefail
cd "$(dirname "$0")/.."
set -a
source .env
set +a
[[ "$DB_NAME" =~ ^[a-zA-Z0-9_]+$ ]] || { echo 'Invalid DB_NAME'; exit 1; }
mysql_container="${MYSQL_CONTAINER:-homework_mysql_prod}"
backup_dir="backups/$(date +%Y%m%dT%H%M%S)"
umask 077
mkdir -p "$backup_dir"
# Stop only THIS project's API so SQL and attachments form a consistent backup.
api_id="$(docker compose ps -q api)"
[[ -n "$api_id" ]] || { echo 'Project API must be running before backup'; exit 1; }
trap 'docker compose start api >/dev/null' EXIT
docker compose stop api
export MYSQL_PWD="$DB_PASSWORD"
docker exec -e MYSQL_PWD "$mysql_container" mysqldump --user="$DB_USER" --single-transaction --no-tablespaces --set-gtid-purged=OFF "$DB_NAME" | gzip > "$backup_dir/database.sql.gz"
unset MYSQL_PWD
docker compose cp api:/app/data "$backup_dir/attachments"
echo "Backup saved: $backup_dir (copy it off this server)"
