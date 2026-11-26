#!/usr/bin/env bash
# Isolated command-flow tests; Docker and sudo are simulated, Git is local-only.
set -euo pipefail
root="$(cd "$(dirname "$0")/.." && pwd)"
temp="$(mktemp -d)"
export REAL_GIT="$(command -v git)"
mkdir "$temp/bin"
cat > "$temp/bin/docker" <<'MOCK'
#!/usr/bin/env bash
set -eu
printf '%s\n' "$*" >> "$TEST_CALLS"
case "$1" in
  info) [[ ${NEED_SUDO:-0} != 1 || ${SUDO_ACTIVE:-0} == 1 ]]; exit;;
  inspect) exit 0;;
  exec) cat >/dev/null; [[ ${FAIL_DUMP:-0} != 1 ]] || exit 42; printf 'CREATE TABLE test(id INT);\n'; exit;;
  compose) shift;;
  *) exit 90;;
esac
case "$1" in
  version|config|stop|start|logs) exit 0;;
  ps) [[ "$*" != *'--status running'* ]] || printf 'api-container\n';;
  exec)
    if [[ "$*" == *'const values='* ]]; then printf 'homework_assistant\nfake-$-password\nhomework_assistant';
    elif [[ "$*" == *' web wget '* ]]; then printf '{"ok":true}'; fi;;
  cp) dest="${@: -1}"; printf 'attachment\n' > "$dest/example.txt";;
  build) [[ ${FAIL_BUILD:-0} != 1 ]] || exit 43;;
  up) [[ ${FAIL_UP:-0} != 1 ]] || exit 44;;
  *) exit 91;;
esac
MOCK
cat > "$temp/bin/git" <<'MOCK'
#!/usr/bin/env bash
if [[ "$1" == fetch && ${FAIL_FETCH:-0} == 1 ]]; then exit 45; fi
exec "$REAL_GIT" "$@"
MOCK
cat > "$temp/bin/sudo" <<'MOCK'
#!/usr/bin/env bash
[[ "$1" != -v ]] || exit 0
export SUDO_ACTIVE=1
exec "$@"
MOCK
cat > "$temp/bin/flock" <<'MOCK'
#!/usr/bin/env bash
# Windows Git Bash lacks flock; test denial logic, not the OS lock primitive.
[[ ${FAIL_LOCK:-0} != 1 ]]
MOCK
chmod +x "$temp/bin/"*
export PATH="$temp/bin:$PATH"
count=0
fixture() {
  count=$((count+1))
  work="$temp/case$count"
  mkdir -p "$work/scripts"
  cp "$root"/scripts/{manage,common,backup}.sh "$work/scripts/"
  cp "$root/.gitignore" "$work/.gitignore"
  # Deliberately not shell-sourceable, as Compose .env is not a shell script.
  printf 'PARENT_PASSWORD=literal $value with spaces\n' > "$work/.env"
  printf 'custom HTTPS configuration\n' > "$work/compose.override.yaml"
  "$REAL_GIT" init -q -b main "$work"
  "$REAL_GIT" -C "$work" config core.autocrlf false
  "$REAL_GIT" -C "$work" config user.name 'Deploy Test'
  "$REAL_GIT" -C "$work" config user.email 'test@example.invalid'
  "$REAL_GIT" -C "$work" add .
  "$REAL_GIT" -C "$work" commit -qm initial
  "$REAL_GIT" init -q --bare "$temp/remote$count.git"
  "$REAL_GIT" -C "$work" remote add origin "$temp/remote$count.git"
  "$REAL_GIT" -C "$work" push -qu origin main
  export TEST_CALLS="$temp/calls$count.log"
  : > "$TEST_CALLS"
  output="$temp/output$count.log"
  unset FAIL_DUMP FAIL_BUILD FAIL_UP FAIL_FETCH FAIL_LOCK NEED_SUDO SUDO_ACTIVE
}
new_remote_commit() {
  "$REAL_GIT" clone -q -b main "$temp/remote$count.git" "$temp/publisher$count"
  "$REAL_GIT" -C "$temp/publisher$count" config user.name 'Deploy Test'
  "$REAL_GIT" -C "$temp/publisher$count" config user.email 'test@example.invalid'
  printf 'new version\n' > "$temp/publisher$count/version.txt"
  "$REAL_GIT" -C "$temp/publisher$count" add version.txt
  "$REAL_GIT" -C "$temp/publisher$count" commit -qm update
  "$REAL_GIT" -C "$temp/publisher$count" push -q
}
run_manage() { bash "$work/scripts/manage.sh" "$@" > "$output" 2>&1; }
assert_no_mutation() { ! grep -Eq '^compose (stop|start|build|up|cp) ' "$TEST_CALLS"; }

fixture
export NEED_SUDO=1
run_manage restart
grep -q 'compose up -d --force-recreate --wait' "$TEST_CALLS"
! grep -q '^compose build' "$TEST_CALLS"
[[ -f "$work/.deploy-state/last-release" ]]
grep -q 'literal \$value with spaces' "$work/.env"
grep -q 'custom HTTPS' "$work/compose.override.yaml"
printf 'PASS restart loads config without build; automatic sudo; local files preserved\n'

fixture
run_manage backup
[[ $(find "$work/backups" -name COMPLETE | wc -l) -eq 1 ]]
grep -q '^compose start api$' "$TEST_CALLS"
! grep -q 'fake-\$-password' "$output"
printf 'PASS consistent backup succeeds without printing credentials\n'

fixture
export FAIL_DUMP=1
if run_manage update; then echo 'Expected backup failure'; exit 1; fi
grep -q '^compose start api$' "$TEST_CALLS"
! grep -Eq '^compose (build|up) ' "$TEST_CALLS"
[[ $(find "$work/backups" -name COMPLETE | wc -l) -eq 0 ]]
printf 'PASS failed backup restores API and blocks deployment\n'

fixture
new_remote_commit
run_manage update
[[ -f "$work/version.txt" ]]
grep -q '^compose build api$' "$TEST_CALLS"
grep -q '^compose build web$' "$TEST_CALLS"
[[ -f "$work/.deploy-state/last-release" ]]
printf 'PASS update fast-forwards, backs up, builds and health-checks\n'

fixture
new_remote_commit
export FAIL_BUILD=1
if run_manage update; then echo 'Expected build failure'; exit 1; fi
grep -q '^compose start api$' "$TEST_CALLS"
! grep -q '^compose up' "$TEST_CALLS"
printf 'PASS build failure does not replace running containers\n'

fixture
export FAIL_FETCH=1
if run_manage update; then echo 'Expected fetch failure'; exit 1; fi
assert_no_mutation
printf 'PASS network failure leaves services unchanged\n'

fixture
printf 'local edit\n' >> "$work/scripts/manage.sh"
if run_manage update; then echo 'Expected dirty-tree refusal'; exit 1; fi
assert_no_mutation
printf 'PASS local code edits are not overwritten\n'

fixture
export FAIL_LOCK=1
if run_manage restart; then echo 'Expected lock refusal'; exit 1; fi
assert_no_mutation
printf 'PASS concurrent-operation lock refusal\n'

fixture
run_manage deploy --no-cache
grep -q '^compose build --no-cache api$' "$TEST_CALLS"
grep -q '^compose build --no-cache web$' "$TEST_CALLS"
! grep -q '^compose stop api$' "$TEST_CALLS"
[[ -f "$work/.deploy-state/last-release" ]]
printf 'PASS initial deployment supports a clean build without a running API\n'

fixture
export FAIL_UP=1
if run_manage restart; then echo 'Expected unhealthy-service failure'; exit 1; fi
[[ ! -f "$work/.deploy-state/last-release" ]]
printf 'PASS failed startup is not recorded as a successful release\n'

printf '\nAll 10 deployment-flow tests passed. Temporary fixtures: %s\n' "$temp"
