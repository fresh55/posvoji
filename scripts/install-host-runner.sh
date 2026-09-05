#!/usr/bin/env bash
# Installs units without starting jobs or touching the current public release.
# Run only after preparing /srv/posvoji/app and the private configuration files.
set -euo pipefail
[[ $(id -u) = 0 ]] || { echo 'install-host-runner requires root' >&2; exit 1; }
repo=/srv/posvoji/app
[[ -d "$repo/.git" || -f "$repo/.git" ]] || { echo 'install the pinned checkout at /srv/posvoji/app first' >&2; exit 1; }
for tool in node pnpm python3 git curl flock systemctl systemd-analyze; do
  command -v "$tool" >/dev/null || { echo "missing prerequisite: $tool" >&2; exit 1; }
done
node -e 'if (Number(process.versions.node.split(".")[0]) < 22) process.exit(1)'
python3 -c 'import sys; assert sys.version_info >= (3, 12)'
id posvoji >/dev/null
getent group caddy >/dev/null
[[ -s /etc/posvoji/crawl.env && -s /etc/posvoji/backup.env ]] || { echo 'prepare private crawl.env and backup.env first' >&2; exit 1; }
[[ -d "$repo/node_modules" ]] || { echo 'install pinned dependencies as posvoji before installing the units' >&2; exit 1; }
install -d -o posvoji -g caddy -m 750 /srv/posvoji/.cache /srv/posvoji/.local
install -d -o posvoji -g caddy -m 700 /srv/posvoji/backups
systemd-analyze verify "$repo/scripts/systemd/posvoji-crawl.service" "$repo/scripts/systemd/posvoji-crawl.timer" "$repo/scripts/systemd/posvoji-backup.service" "$repo/scripts/systemd/posvoji-backup.timer"
for unit in posvoji-crawl.service posvoji-crawl.timer posvoji-backup.service posvoji-backup.timer; do
  install -o root -g root -m 644 "$repo/scripts/systemd/$unit" "/etc/systemd/system/$unit"
done
systemctl daemon-reload
echo 'Units installed. Run and verify one supervised crawl and backup before enabling the timers.'
