#!/usr/bin/env python3
"""Send a bounded host failure notice without including logs or credentials."""

import argparse
import json
import os
import smtplib
import ssl
import sys
import tempfile
from datetime import UTC, datetime
from email.message import EmailMessage
from email.utils import formataddr
from pathlib import Path

UNITS = {
    "posvoji-health.service",
    "posvoji-crawl.service",
    "posvoji-backup.service",
    "posvoji-portal.service",
    "posvoji-alert-test.service",
}


def enabled(env, name):
    return env.get(name, "").strip().lower() in {"1", "true", "yes", "on"}


def notify(unit, env, *, github_actions=False, recovered=False):
    if unit not in UNITS:
        raise ValueError("unexpected service")
    if recovered and (unit != "posvoji-health.service" or github_actions):
        raise ValueError("recovery notices require the host health check")
    required = (
        "POSVOJI_ALERT_TO",
        "PORTAL_EMAIL_HOST",
        "PORTAL_EMAIL_USER",
        "PORTAL_EMAIL_PASSWORD",
        "PORTAL_FROM_EMAIL",
    )
    if any(not env.get(name, "").strip() for name in required):
        raise ValueError("alert recipient and SMTP configuration are required")
    tls = enabled(env, "PORTAL_EMAIL_USE_TLS")
    implicit_tls = enabled(env, "PORTAL_EMAIL_USE_SSL")
    if tls == implicit_tls:
        raise ValueError("choose exactly one encrypted SMTP transport")
    port = int(env.get("PORTAL_EMAIL_PORT", "587"))
    timeout = int(env.get("PORTAL_EMAIL_TIMEOUT", "10"))
    if not 1 <= port <= 65535 or not 1 <= timeout <= 60:
        raise ValueError("invalid SMTP port or timeout")
    message = EmailMessage()
    test = unit == "posvoji-alert-test.service"
    outcome = "recovered" if recovered else "failed"
    message["Subject"] = f"{'[TEST] ' if test else ''}Posvoji.si: {unit} {outcome}"
    message["From"] = formataddr(
        (env.get("PORTAL_FROM_NAME", "Posvoji.si"), env["PORTAL_FROM_EMAIL"])
    )
    message["To"] = env["POSVOJI_ALERT_TO"]
    message["Reply-To"] = env.get("PORTAL_REPLY_TO_EMAIL", env["PORTAL_FROM_EMAIL"])
    if github_actions:
        run_id = env.get("GITHUB_RUN_ID", "")
        if not run_id.isdigit():
            raise ValueError("GitHub run id is required")
        location = (
            "The external production check reported a failure in GitHub Actions.\n"
            + f"Inspect: https://github.com/fresh55/posvoji/actions/runs/{run_id}\n"
        )
    else:
        location = (
            (
                "The production health check is passing again.\n"
                if recovered
                else f"Systemd reported a failure in {unit}.\n"
            )
            + f"Inspect: systemctl status {unit}\n"
            + f"Then: journalctl -u {unit} --since today\n"
        )
    message.set_content(
        ("This is a deliberate alert delivery test.\n\n" if test else "")
        + location
        + "\n"
        + "This notice contains no application logs or listing data.\n"
        + (
            "Delivery depends on GitHub and the mail provider.\n"
            if github_actions
            else "A host-local alert cannot report a host or mail-provider outage.\n"
        )
    )
    context = ssl.create_default_context()
    factory = smtplib.SMTP_SSL if implicit_tls else smtplib.SMTP
    options = {"timeout": timeout}
    if implicit_tls:
        options["context"] = context
    with factory(env["PORTAL_EMAIL_HOST"], port, **options) as connection:
        if tls:
            connection.starttls(context=context)
        connection.login(env["PORTAL_EMAIL_USER"], env["PORTAL_EMAIL_PASSWORD"])
        refused = connection.send_message(message)
        if refused:
            raise RuntimeError("SMTP refused an alert recipient")


def report_health(directory, env, *, recovered=False):
    """Send once per host health incident, committing only accepted notices."""
    import fcntl

    with (directory / ".health.lock").open("a") as lock:
        fcntl.flock(lock, fcntl.LOCK_EX)
        path = directory / "health.json"
        state = (
            json.loads(path.read_text())
            if path.exists()
            else {
                "version": 1,
                "active": False,
            }
        )
        if state.get("version") != 1 or type(state.get("active")) is not bool:
            raise ValueError("invalid health incident state")
        active = not recovered
        if state["active"] == active:
            return False
        notify("posvoji-health.service", env, recovered=recovered)
        state.update(active=active, changedAt=datetime.now(UTC).isoformat())
        fd, name = tempfile.mkstemp(prefix=".health-", dir=directory)
        try:
            with os.fdopen(fd, "w") as output:
                json.dump(state, output)
                output.flush()
                os.fsync(output.fileno())
            os.replace(name, path)
        finally:
            Path(name).unlink(missing_ok=True)
        return True


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("unit", choices=sorted(UNITS))
    parser.add_argument("--github-actions", action="store_true")
    parser.add_argument("--recovered", action="store_true")
    parser.add_argument("--state-directory", type=Path)
    args = parser.parse_args()
    try:
        env = dict(os.environ)
        if args.github_actions:
            configuration = json.loads(env.get("POSVOJI_ALERT_CONFIG", ""))
            if not isinstance(configuration, dict) or not all(
                isinstance(k, str)
                and isinstance(v, str)
                and (k.startswith("PORTAL_") or k == "POSVOJI_ALERT_TO")
                for k, v in configuration.items()
            ):
                raise ValueError("invalid private alert configuration")
            env.update(configuration)
        if args.recovered and (
            not args.state_directory
            or args.github_actions
            or args.unit != "posvoji-health.service"
        ):
            raise ValueError("recovery requires persistent host health state")
        if args.state_directory and args.unit == "posvoji-health.service":
            if args.github_actions:
                raise ValueError("host incident state cannot be used in Actions")
            sent = report_health(args.state_directory, env, recovered=args.recovered)
        else:
            notify(args.unit, env, github_actions=args.github_actions)
            sent = True
    except Exception as error:
        # SMTP exceptions can contain recipients or server-supplied details.
        print(f"Notice was not sent ({type(error).__name__}).", file=sys.stderr)
        return 1
    if sent:
        outcome = "recovery" if args.recovered else "failure"
        print(f"SMTP accepted the {outcome} notice.")
    else:
        print("Health incident unchanged; no notice sent.")
    return 0


if __name__ == "__main__":
    sys.exit(main())
