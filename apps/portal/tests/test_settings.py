import os
import subprocess
import sys
from pathlib import Path

PORTAL_ROOT = Path(__file__).resolve().parents[1]


def import_settings(env: dict[str, str]) -> subprocess.CompletedProcess[str]:
    return subprocess.run(
        [sys.executable, "-c", "import portal.settings"],
        capture_output=True,
        check=False,
        cwd=PORTAL_ROOT,
        env=env,
        text=True,
    )


def test_production_refuses_the_public_development_signing_key():
    env = os.environ.copy()
    env["PORTAL_DEBUG"] = "false"
    env.pop("PORTAL_SECRET_KEY", None)

    result = import_settings(env)

    assert result.returncode != 0
    assert "PORTAL_SECRET_KEY must be set" in result.stderr


def test_production_accepts_an_explicit_private_signing_key():
    env = os.environ.copy()
    env["PORTAL_DEBUG"] = "false"
    env["PORTAL_SECRET_KEY"] = "test-only-private-signing-key"

    result = import_settings(env)

    assert result.returncode == 0, result.stderr
