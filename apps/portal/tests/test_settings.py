import os
import subprocess
import sys
from pathlib import Path

import pytest

PORTAL_ROOT = Path(__file__).resolve().parents[1]
PUBLISHED_DEVELOPMENT_SECRET_KEY = "dev-only-insecure-secret-key"


def import_settings(
    env: dict[str, str], expression: str = "import portal.settings"
) -> subprocess.CompletedProcess[str]:
    return subprocess.run(
        [sys.executable, "-c", expression],
        capture_output=True,
        check=False,
        cwd=PORTAL_ROOT,
        env=env,
        text=True,
    )


def test_production_refuses_a_missing_signing_key():
    env = os.environ.copy()
    env["PORTAL_DEBUG"] = "false"
    env.pop("PORTAL_SECRET_KEY", None)

    result = import_settings(env)

    assert result.returncode != 0
    assert "PORTAL_SECRET_KEY must be set" in result.stderr


def test_production_refuses_the_published_development_signing_key():
    env = os.environ.copy()
    env["PORTAL_DEBUG"] = "false"
    env["PORTAL_SECRET_KEY"] = PUBLISHED_DEVELOPMENT_SECRET_KEY

    result = import_settings(env)

    assert result.returncode != 0
    assert "PORTAL_SECRET_KEY must be set" in result.stderr


def test_production_accepts_an_explicit_private_signing_key():
    env = os.environ.copy()
    env["PORTAL_DEBUG"] = "false"
    env["PORTAL_SECRET_KEY"] = "test-only-private-signing-key"

    result = import_settings(env)

    assert result.returncode == 0, result.stderr


def test_development_generates_a_fresh_signing_key_per_process():
    env = os.environ.copy()
    env["PORTAL_DEBUG"] = "true"
    env.pop("PORTAL_SECRET_KEY", None)
    expression = "import portal.settings; print(portal.settings.SECRET_KEY)"

    first = import_settings(env, expression)
    second = import_settings(env, expression)

    assert first.returncode == 0, first.stderr
    assert second.returncode == 0, second.stderr
    assert first.stdout.strip() != PUBLISHED_DEVELOPMENT_SECRET_KEY
    assert first.stdout.strip() != second.stdout.strip()


@pytest.mark.parametrize("value", ["-1", "not-an-integer"])
def test_trusted_proxy_count_must_be_a_non_negative_integer(value):
    env = os.environ.copy()
    env["PORTAL_TRUSTED_PROXY_COUNT"] = value

    result = import_settings(env)

    assert result.returncode != 0
    assert "PORTAL_TRUSTED_PROXY_COUNT must be a non-negative integer" in result.stderr


@pytest.mark.parametrize("value", ["0", "-5", "soon"])
def test_db_timeout_must_be_a_positive_integer(value):
    env = os.environ.copy()
    env["PORTAL_DB_TIMEOUT"] = value

    result = import_settings(env)

    assert result.returncode != 0
    assert "PORTAL_DB_TIMEOUT must be a positive integer" in result.stderr


def test_the_database_queues_writers_instead_of_failing():
    env = os.environ.copy()
    env.pop("PORTAL_DB_TIMEOUT", None)
    env.pop("PORTAL_DB_INIT_COMMAND", None)
    expression = (
        "import portal.settings as s; o = s.DATABASES['default']['OPTIONS']; "
        "print(o['transaction_mode'], o['timeout'], o['init_command'])"
    )

    result = import_settings(env, expression)

    assert result.returncode == 0, result.stderr
    assert result.stdout.strip() == (
        "IMMEDIATE 20 PRAGMA journal_mode=WAL; PRAGMA synchronous=NORMAL;"
    )


@pytest.mark.parametrize("value", ["0", "-5", "not-an-integer"])
def test_email_timeout_must_be_a_positive_integer(value):
    env = os.environ.copy()
    env["PORTAL_EMAIL_TIMEOUT"] = value

    result = import_settings(env)

    assert result.returncode != 0
    assert "PORTAL_EMAIL_TIMEOUT must be a positive integer" in result.stderr


def test_tls_and_ssl_together_are_refused_by_name():
    env = os.environ.copy()
    env["PORTAL_EMAIL_USE_TLS"] = "true"
    env["PORTAL_EMAIL_USE_SSL"] = "true"

    result = import_settings(env)

    assert result.returncode != 0
    assert "PORTAL_EMAIL_USE_TLS" in result.stderr
    assert "PORTAL_EMAIL_USE_SSL" in result.stderr


def test_mail_defaults_are_a_timeout_a_name_and_a_reply_to():
    env = os.environ.copy()
    for name in (
        "PORTAL_EMAIL_TIMEOUT",
        "PORTAL_FROM_NAME",
        "PORTAL_REPLY_TO_EMAIL",
        "PORTAL_EMAIL_USE_SSL",
    ):
        env.pop(name, None)
    expression = (
        "import portal.settings as s; "
        "print(s.EMAIL_TIMEOUT, s.EMAIL_USE_SSL, s.PORTAL_FROM_NAME, "
        "s.PORTAL_REPLY_TO_EMAIL, s.SESAME_MAX_AGE)"
    )

    result = import_settings(env, expression)

    assert result.returncode == 0, result.stderr
    assert result.stdout.strip() == "10 False Posvoji.si info@posvoji.si 86400"
