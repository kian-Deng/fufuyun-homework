#!/usr/bin/env bash
set -euo pipefail
source "$(dirname "${BASH_SOURCE[0]}")/backup.sh"

usage() {
  cat <<'HELP'
用法：bash scripts/manage.sh <命令> [选项]
  update [--no-cache]  备份 → Git快进更新 → 构建 → 发布 → 健康检查
  deploy [--no-cache]  构建并发布当前代码（首次部署，不拉代码、不备份）
  restart             重新创建服务，加载 .env，不拉代码、不构建
  start               启动已有服务并检查健康
  stop                停止本项目服务，保留数据和其他应用
  status              查看容器状态和上次成功发布版本
  logs [api|web]      最近100条日志，持续跟踪；Ctrl+C退出
  backup              备份本项目数据库和附件，完成后恢复API
  check               检查本机API及网页代理
  help                显示帮助；不带命令时打开菜单
请用持有Git凭据的普通用户执行，脚本按需为Docker使用sudo。
HELP
}

action="${1:-}"
if [[ -z "$action" ]]; then
  [[ -t 0 ]] || { usage; exit 0; }
  printf '1 更新发布\n2 首次部署\n3 重启服务/加载配置\n4 启动\n5 停止\n6 状态\n7 日志\n8 备份\n9 健康检查\n0 退出\n'
  read -r -p '请选择：' choice
  case "$choice" in
    1) action=update;; 2) action=deploy;; 3) action=restart;;
    4) action=start;; 5) action=stop;; 6) action=status;;
    7) action=logs;; 8) action=backup;; 9) action=check;;
    0) exit 0;; *) fail '无效选项。';;
  esac
fi
case "$action" in help|-h|--help) usage; exit 0;; esac
case "$action" in update|deploy|restart|start|stop|status|logs|backup|check) ;; *) usage; exit 1;; esac
option="${2:-}"
[[ $# -le 2 ]] || fail '参数过多。'
case "$action:$option" in
  update:|deploy:|update:--no-cache|deploy:--no-cache|logs:|logs:api|logs:web) ;;
  *) [[ -z "$option" ]] || fail '不支持的选项。';;
esac

init_docker
case "$action" in status|logs|check) ;; *) lock_project;; esac
trap 'printf "操作失败（退出码 %s），请根据错误处理；未自动回退数据库。\n" "$?" >&2' ERR

build_images() {
  local -a args=()
  [[ "$option" != '--no-cache' ]] || args+=(--no-cache)
  # Sequential builds reduce memory pressure on the 2-core/4GB server.
  compose build "${args[@]}" api
  compose build "${args[@]}" web
}

case "$action" in
  update)
    command -v git >/dev/null || fail '未安装 Git。'
    [[ "$(cd "$(git rev-parse --show-toplevel)" && pwd)" == "$PROJECT_ROOT" ]] || fail '当前目录不是项目Git仓库。'
    [[ -z "$(git status --porcelain)" ]] || fail '代码目录有本地改动，请先处理；脚本不会覆盖或自动stash。'
    git rev-parse --abbrev-ref '@{upstream}' >/dev/null || fail '当前分支未配置跟踪分支。'
    say '读取远程更新（网络失败时服务继续运行）'
    git fetch
    git merge-base --is-ancestor HEAD '@{upstream}' || fail '本地和远程历史无法快进，请手动处理。'
    say '备份当前运行版本的数据（短暂停止API，随后恢复）'
    backup_project
    say '快进更新代码'
    git merge --ff-only '@{upstream}'
    compose config --quiet
    say '构建镜像，旧服务继续运行'
    build_images
    say '发布新版本'
    release_app
    ;;
  deploy)
    say '首次部署当前代码（数据库和.env须已配置）'
    build_images
    release_app
    ;;
  restart)
    say '重新创建服务并加载配置'
    release_app
    ;;
  start)
    compose up -d --wait --wait-timeout 120 api web
    wait_for_app
    ;;
  stop) compose stop web api;;
  status)
    compose ps -a
    if [[ -f .deploy-state/last-release ]]; then
      printf '\n上次通过健康检查的发布版本及UTC时间：\n'
      cat .deploy-state/last-release
    fi
    ;;
  logs)
    if [[ -n "$option" ]]; then compose logs --tail=100 -f "$option"; else compose logs --tail=100 -f api web; fi
    ;;
  backup) backup_project; wait_for_app;;
  check) wait_for_app;;
esac
