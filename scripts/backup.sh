#!/usr/bin/env bash
set -euo pipefail
source "$(dirname "${BASH_SOURCE[0]}")/common.sh"

backup_project() (
  set -euo pipefail
  umask 077
  local api_id settings_output backup_dir stopped=0
  local -a settings
  api_id="$(compose ps --status running -q api)"
  [[ -n "$api_id" ]] || fail '备份需要 API 正在运行；首次部署请使用 manage.sh deploy。'
  # Read real credentials from the RUNNING service, never shell-source .env.
  # Capture stdout so secrets are not printed or included in CLI arguments.
  settings_output="$(compose exec -T api node -e '
    const values=[process.env.DB_USER,process.env.DB_PASSWORD,process.env.DB_NAME];
    if(values.some(v=>!v||/[\r\n]/.test(v)))process.exit(1);
    process.stdout.write(values.join("\n"));
  ')"
  mapfile -t settings <<< "$settings_output"
  [[ ${#settings[@]} -eq 3 ]] || fail '无法读取运行中的数据库配置。'
  [[ "${settings[2]}" =~ ^[a-zA-Z0-9_]+$ ]] || fail '数据库名格式无效。'
  local mysql_container="${MYSQL_CONTAINER:-homework_mysql_prod}"
  "${DOCKER[@]}" inspect "$mysql_container" >/dev/null
  backup_dir="backups/$(date +%Y%m%dT%H%M%S)-$$"
  mkdir -p "$backup_dir/attachments"

  restore_api() {
    local code=$?
    trap - EXIT
    if (( stopped )); then
      if ! compose start api >/dev/null; then
        printf '警告：备份结束后 API 未能恢复，请执行 manage.sh start。\n' >&2
        code=1
      fi
    fi
    exit "$code"
  }
  trap restore_api EXIT
  trap 'exit 130' INT
  trap 'exit 143' TERM
  stopped=1
  compose stop api
  printf '%s\n' "${settings[@]}" | "${DOCKER[@]}" exec -i "$mysql_container" sh -c '
    IFS= read -r dump_user
    IFS= read -r MYSQL_PWD
    IFS= read -r dump_database
    export MYSQL_PWD
    exec mysqldump --user="$dump_user" --single-transaction --no-tablespaces --set-gtid-purged=OFF "$dump_database"
  ' | gzip > "$backup_dir/database.sql.gz"
  compose cp api:/app/data/. "$backup_dir/attachments"
  gzip -t "$backup_dir/database.sql.gz"
  printf 'complete\n' > "$backup_dir/COMPLETE"
  printf '备份完成：%s/%s，请另存到服务器之外。\n' "$PROJECT_ROOT" "$backup_dir"
)

if [[ "${BASH_SOURCE[0]}" == "$0" ]]; then
  init_docker
  lock_project
  backup_project
fi
