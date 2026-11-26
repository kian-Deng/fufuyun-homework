#!/usr/bin/env bash
# Shared helpers. Source this file; do not execute it directly.
PROJECT_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$PROJECT_ROOT"

fail() { printf '错误：%s\n' "$*" >&2; exit 1; }
say() { printf '\n== %s ==\n' "$*"; }

init_docker() {
  command -v docker >/dev/null || fail '未安装 Docker。'
  [[ -f .env ]] || fail '缺少 .env；请先从 .env.example 创建并填写配置。'
  DOCKER=(docker)
  if ! docker info >/dev/null 2>&1; then
    command -v sudo >/dev/null || fail '无法连接 Docker，请检查服务和权限。'
    sudo -v
    DOCKER=(sudo docker)
    "${DOCKER[@]}" info >/dev/null || fail 'Docker 服务不可用。'
  fi
  "${DOCKER[@]}" compose version >/dev/null
  "${DOCKER[@]}" compose config --quiet
}

compose() { "${DOCKER[@]}" compose "$@"; }

lock_project() {
  command -v flock >/dev/null || fail '缺少 flock，请安装 util-linux。'
  mkdir -p .deploy-state
  exec 9>.deploy-state/operation.lock
  flock -n 9 || fail '另一个部署、重启或备份任务正在运行，请稍后重试。'
}

wait_for_app() {
  # Check the API and Web proxy without depending on public DNS or certificates.
  local attempt body
  for attempt in {1..30}; do
    if compose exec -T api node -e "fetch('http://127.0.0.1:3100/api/health',{signal:AbortSignal.timeout(3000)}).then(r=>{if(!r.ok)process.exit(1)}).catch(()=>process.exit(1))" >/dev/null 2>&1; then
      if body="$(compose exec -T web wget -q -T 5 -O - http://127.0.0.1/api/health 2>/dev/null)" && [[ "$body" == '{"ok":true}' ]]; then
        printf '健康检查通过：API 和网页代理均正常。\n'
        return 0
      fi
    fi
    sleep 2
  done
  printf '健康检查未通过，请执行：bash scripts/manage.sh logs\n' >&2
  return 1
}

release_app() {
  # Recreate rather than restart so edited .env values are loaded too.
  compose up -d --force-recreate --wait --wait-timeout 120 api web
  wait_for_app
  mkdir -p .deploy-state
  { git rev-parse HEAD 2>/dev/null || printf 'source-archive\n'; date -u +%Y-%m-%dT%H:%M:%SZ; } > .deploy-state/last-release
  compose ps
}
