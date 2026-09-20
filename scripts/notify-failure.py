#!/usr/bin/env python3
"""Send a bounded host failure notice without including logs or credentials."""

import argparse
import json
import os
import smtplib
import ssl
import sys
from email.message import EmailMessage
from email.utils import formataddr

UNITS = {
    "posvoji-health.service",
    "posvoji-crawl.service",
    "posvoji-backup.service",
    "posvoji-portal.service",
    "posvoji-alert-test.service",
}


def enabled(env, name):
    return env.get(name, "").strip().lower() in {"1", "true", "yes", "on"}


def notify(unit, env, *, github_actions=False):
    if unit not in UNITS:
        raise ValueError("unexpected service")
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
    message["Subject"] = f"{'[TEST] ' if test else ''}Posvoji.si: {unit} failed"
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
            f"Systemd reported a failure in {unit}.\n"
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


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("unit", choices=sorted(UNITS))
    parser.add_argument("--github-actions", action="store_true")
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
        notify(args.unit, env, github_actions=args.github_actions)
    except Exception as error:
        # SMTP exceptions can contain recipients or server-supplied details.
        print(f"Failure notice was not sent ({type(error).__name__}).", file=sys.stderr)
        return 1
    print("SMTP accepted the failure notice.")
    return 0


if __name__ == "__main__":
    sys.exit(main())
