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
