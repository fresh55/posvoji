# Recover SSH after the maintainer address changes

Use this when SSH times out after an address change. The Hetzner Cloud firewall
`posvoji-web` and the installed host's UFW must both allow the current source
address. HTTPS working while TCP 22 times out suggests filtering; it does not
prove which firewall is responsible or that the SSH service is healthy.

This procedure has not been executed as part of this documentation change.
The [6 September handover](2026-09-06-crawl-handover.md) records an earlier
successful recovery through Rescue. Keep actual home addresses, credentials,
firewall exports and recovery transcripts private.

## 1. Establish the current state

From the same PC and network that will make the SSH connection, obtain the
current public IPv4 address from the router or an approved address-checking
service. Do not reuse an address from an old incident. Account for a VPN or
other egress route. Confirm the server's address in Hetzner Console.

In PowerShell, substitute that server address:

```powershell
$serverAddress = '<SERVER_IPV4>'
Test-NetConnection -ComputerName $serverAddress -Port 22
```

Check HTTPS in the browser, signing in through the preview gate. A 401 shows
that the gate answers, not that the homepage works. Note publication time and
source-check freshness separately. SSH loss does not stop the host crawl timer;
a fresh page also does not prove that every scheduled job or backup succeeded.

## 2. Add the current address in Hetzner Console

Open the correct project, then the firewall `posvoji-web`. Verify its attached
server before editing. Save a private record of the existing rules.

Add the current public IPv4 address as a `/32` source on inbound TCP port 22,
keeping the old source until recovery is verified. Preserve the web rules and
all unrelated sources, ports and outbound rules. Do not allow SSH from
`0.0.0.0/0` or `::/0`. This procedure uses IPv4; an intentional IPv6 SSH path
needs its own exact `/128` source in both firewalls.

Retry the TCP check and a fresh SSH connection using the existing account and
key. If SSH works, keep that session open and continue with the live-host path.
If it still times out, use the console to inspect the installed host, or use
Rescue if console login is unavailable. Updating the Cloud firewall alone does
not update UFW on disk.

See Hetzner's [firewall overview](https://docs.hetzner.com/cloud/firewalls/overview/)
and [firewall FAQ](https://docs.hetzner.com/cloud/firewalls/faq/).

## 3A. Repair UFW from the running host

Use an existing SSH session or an authenticated console session. Inspect first:

```bash
sudo ufw status verbose
sudo ufw status numbered
sudo ss -lntp 'sport = :22'
sudo systemctl status ssh --no-pager
```

If there is no listener, investigate SSH's service and journal before changing
more firewall rules. If UFW is unexpectedly inactive, investigate that state;
do not reset or enable it blindly.

Back up the configuration and add the current source, replacing the placeholder:

```bash
firewall_backup="/root/ufw-before-recovery-$(date -u +%Y%m%dT%H%M%SZ)"
sudo cp -a /etc/ufw "$firewall_backup"
sudo ufw allow proto tcp from <CURRENT_PUBLIC_IPV4>/32 to any port 22 comment 'SSH-current-IP'
sudo ufw status numbered
```

Check that an earlier deny rule does not shadow the new allow rule. Open a
second, fresh SSH connection from the PC before removing any old rule. Continue
at step 4. UFW's [manual](https://manpages.ubuntu.com/manpages/noble/man8/ufw.8.html)
documents source-specific rules, comments and numbered deletion.

## 3B. Repair the installed configuration through Rescue

Rescue requires a reboot: the website, portal and host jobs stop during recovery.
Choose a maintenance window and, if console access permits, check for an active
crawl or backup before rebooting. Do not force a power cycle through an active
job when a graceful shutdown is available.

In the server's Rescue panel, enable Linux Rescue with the existing SSH key,
then reboot into it. Connect as root. Rescue has a different SSH host key;
verify its fingerprint through the authenticated Hetzner console and use a
separate temporary known-hosts file for Rescue. Preserve the installed host's
known key and keep host-key checking enabled.

Follow Hetzner's [Rescue instructions](https://docs.hetzner.com/cloud/servers/getting-started/rescue-system/).
Do not run an installer or rebuild the server.

Inspect the disks; do not assume the root partition is `/dev/sda1`:

```bash
lsblk -f
findmnt /mnt
```

Only use `/mnt` if it is an unused mount point. Mount the identified installed
root partition read-only, as in Hetzner's
[disk recovery guide](https://docs.hetzner.com/cloud/servers/how-to-rescue/back-up-data/):

```bash
mount -o ro /dev/<INSTALLED_ROOT_PARTITION> /mnt
cat /mnt/etc/os-release
cat /mnt/etc/fstab
cat /mnt/etc/ufw/ufw.conf
less /mnt/etc/ufw/user.rules
```

Confirm this is the installed system and UFW is configured with `ENABLED=yes`.
If the disk layout, root filesystem or rule format differs from expectations,
resolve that before editing. The installed configuration is under `/mnt/etc/ufw`;
running `ufw` in Rescue would operate on the rescue environment instead.

Remount only the confirmed root filesystem read-write and back up its UFW files:

```bash
mount -o remount,rw /mnt
firewall_backup="/mnt/root/ufw-before-recovery-$(date -u +%Y%m%dT%H%M%SZ)"
cp -a /mnt/etc/ufw "$firewall_backup"
nano /mnt/etc/ufw/user.rules
```

Locate the existing inbound TCP 22 allow rule for the old source and its
associated `### tuple ###` metadata, including the `SSH-current-IP` comment
(which may be encoded). Duplicate that complete rule stanza in the same chain,
before `COMMIT`, preserving the original. In the duplicate only, replace the
source address in both the metadata and the actual `-s` rule with the current
IPv4 address, keeping the `/32` restriction. Preserve comment encoding and all
other fields. Do not do a global text substitution. If there is no unambiguous
matching stanza, inspect the format before proceeding.

Review the diff and validate the edited IPv4 rules in an isolated network
namespace, so validation cannot alter Rescue's network rules:

```bash
diff -u "$firewall_backup/user.rules" /mnt/etc/ufw/user.rules
unshare --net iptables-restore --test < /mnt/etc/ufw/user.rules
```

The diff should show only the added SSH stanza. `diff` returns 1 for expected
differences; the validation command must return 0. If the validator is missing,
unsupported or fails, keep the backup and resolve validation before rebooting.
This checks rule syntax; a fresh connection after normal boot checks access.
The [`iptables-restore` manual](https://manpages.ubuntu.com/manpages/noble/man8/iptables-restore.8.html)
describes the non-committing `--test` mode.
Do not disable UFW, flush rules or run `ufw reload` inside Rescue or a chroot.

If the edit is wrong, restore just the changed file and inspect it again:

```bash
cp -a "$firewall_backup/user.rules" /mnt/etc/ufw/user.rules
```

When the reviewed edit validates, leave `/mnt`, flush writes and unmount:

```bash
cd /
sync
umount /mnt
```

If unmount fails, resolve the busy mount rather than forcing it. Ensure the next
boot uses the installed disk (disable Rescue in Console if still armed), then
reboot. Use the original SSH settings and installed host key after normal boot.

## 4. Verify before retiring the old source

Open a fresh SSH connection from the current network. On the installed host,
check UFW is active and shows the new source, the TCP 22 listener exists, and
the usual services and timers recovered:

```bash
sudo ufw status verbose
sudo ufw status numbered
sudo ss -lntp 'sport = :22'
sudo systemctl --failed --no-pager
sudo systemctl status caddy --no-pager
sudo systemctl list-timers --all 'posvoji-*' --no-pager
sudo journalctl -u posvoji-crawl.service -u posvoji-backup.service -n 60 --no-pager
```

Verify the homepage over authenticated HTTPS and inspect the most recent job
outcomes. Do not start a second publisher or clear crawl state to compensate for
the reboot. Follow [production operations](../PRODUCTION-OPERATIONS.md) for a
failed or interrupted job. Check off-server backup retrieval separately.

With the console and working SSH session still available, delete only the stale
SSH source rule using its freshly inspected UFW rule number (`sudo ufw delete
<STALE_RULE_NUMBER>`). Re-list after each deletion because numbers change.
Remove that same stale source from the Cloud firewall, preserving any other
authorized sources. Test another fresh SSH connection and HTTPS again.

Record recovery time, checks and backup locations privately. Update the current
address in private deploy notes. The next address change requires this same
two-firewall check; a historical home address is never a permanent setting.

## 5. Resume the staged HSTS change

Once access and services are verified, follow the
[live Caddy HSTS procedure](../DEPLOY-HEADERS.md#applying-hsts-to-the-live-caddyfile).
The firewall repair and the header change have separate verification steps.
