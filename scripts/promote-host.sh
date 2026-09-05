#!/usr/bin/env bash
# Promote a tested commit reachable from origin/main. No crawl or live flip.
set -euo pipefail
[[ $(id -u) = 0 && $# = 1 && $1 =~ ^[a-f0-9]{40}$ ]] || { echo 'usage (as root): promote-host.sh FULL_MAIN_COMMIT_SHA' >&2; exit 1; }
target=$1
repo=/srv/posvoji/app
config=/etc/posvoji/crawl.env
exec 7>/srv/posvoji/.promotion.lock
flock -n 7 || { echo 'another promotion is active' >&2; exit 1; }
as_app() { runuser -u posvoji -- env CI=true TMPDIR=/srv/posvoji/tmp npm_config_store_dir=/srv/posvoji/.local/share/pnpm/store "$@"; }
[[ -z $(as_app git -C "$repo" status --porcelain) ]] || { echo 'installed checkout is dirty' >&2; exit 1; }
as_app git -C "$repo" fetch origin +refs/heads/main:refs/remotes/origin/main
as_app git -C "$repo" merge-base --is-ancestor "$target" origin/main || { echo 'target must be reachable from origin/main' >&2; exit 1; }
old=$(as_app git -C "$repo" rev-parse HEAD)
active_timers=()
for timer in posvoji-crawl.timer posvoji-backup.timer; do
  if systemctl is-active --quiet "$timer"; then active_timers+=("$timer"); fi
done
changed=false
token_file=$(mktemp /srv/posvoji/.promotion-token-XXXXXX)
config_copy=$(mktemp /etc/posvoji/.promotion-config-XXXXXX)
cp -p -- "$config" "$config_copy"
cleanup() {
  local result=$?
  trap - EXIT
  if [[ $result != 0 && $changed = true ]]; then
    echo 'Promotion failed; restoring the previous installed code and configuration.' >&2
    if as_app git -C "$repo" checkout --detach "$old" &&
       as_app pnpm --dir "$repo" install --offline --frozen-lockfile &&
       cp -p -- "$config_copy" "$config" &&
       CI=true bash "$repo/scripts/install-host-runner.sh"; then
      echo 'Previous installation restored.' >&2
    else
      active_timers=()
      echo 'Rollback failed. Timers remain paused; inspect the installation before resuming.' >&2
    fi
  fi
  if [[ -s "$token_file" ]]; then
    if ! node "$repo/scripts/artifact-lock.mjs" release "$repo/.artifact-lock" "$(cat "$token_file")"; then
      active_timers=(); result=1
    fi
  fi
  rm -f -- "$token_file" "$config_copy"
  if [[ ${#active_timers[@]} -gt 0 ]]; then systemctl start "${active_timers[@]}" || result=1; fi
  exit "$result"
}
trap cleanup EXIT
trap 'exit 143' TERM
trap 'exit 130' INT
trap 'exit 129' HUP
systemctl stop posvoji-crawl.timer posvoji-backup.timer
for unit in posvoji-crawl.service posvoji-backup.service; do
  if [[ $(systemctl show "$unit" -p ActiveState --value) != inactive && $(systemctl show "$unit" -p ActiveState --value) != failed ]]; then
    echo 'A host job is active; retry promotion after it finishes.' >&2; exit 1
  fi
done
exec 8>/srv/posvoji/.crawl-run.lock
flock -n 8 || { echo 'a manual crawl is active' >&2; exit 1; }
[[ ! -e /srv/posvoji/.deploy-lock ]] || { echo 'a deployment lock exists; inspect before promoting' >&2; exit 1; }
node "$repo/scripts/artifact-lock.mjs" acquire "$repo/.artifact-lock" promotion "$token_file"
changed=true
as_app git -C "$repo" checkout --detach "$target"
install -d -o posvoji -g caddy -m 700 /srv/posvoji/tmp
as_app pnpm --dir "$repo" fetch --frozen-lockfile
as_app pnpm --dir "$repo" install --offline --frozen-lockfile
CI=true bash "$repo/scripts/install-host-runner.sh"
python3 "$repo/scripts/set-promoted-commit.py" "$config" "$target"
[[ $(as_app git -C "$repo" rev-parse HEAD) = "$target" && -z $(as_app git -C "$repo" status --porcelain) ]]
changed=false
echo "Installed main commit $target. Start one supervised crawl and verify production."
