"""Exercise promotion and dependency-failure rollback without a real host."""

import os
import shutil
import subprocess
import sys
from pathlib import Path

import pytest

pytestmark = pytest.mark.skipif(sys.platform != "linux", reason="host uses Linux")
SCRIPTS = Path(__file__).resolve().parents[3] / "scripts"


@pytest.mark.parametrize("failure", ["", "dependencies", "active", "unmerged"])
def test_promotion_restores_timers_and_never_leaves_a_mismatched_pin(tmp_path, failure):
    base = tmp_path / "host"
    repo = base / "app"
    config_dir = tmp_path / "private"
    config_dir.mkdir()
    config = config_dir / "crawl.env"
    old, new = "a" * 40, "b" * 40
    config.write_text(f"POSVOJI_EXPECTED_SHA={old}\nFIXTURE_VALUE=unchanged\n")
    (repo / "scripts").mkdir(parents=True)
    for name in ("artifact-lock.mjs", "set-promoted-commit.py"):
        shutil.copyfile(SCRIPTS / name, repo / "scripts" / name)
    (repo / "scripts/install-host-runner.sh").write_text("#!/bin/bash\nexit 0\n")
    (base / "head").write_text(old)
    fake = tmp_path / "fake.py"
    fake.write_text(
        """import os, pathlib, sys
base = pathlib.Path(os.environ['FIXTURE_HOST'])
name, args = sys.argv[1], sys.argv[2:]
failure = os.environ['FIXTURE_FAILURE']
with (base / 'commands').open('a') as log:
    log.write(name + ' ' + ' '.join(args) + '\\n')
if name == 'id':
    print('0')
elif name == 'runuser':
    args = args[args.index('--') + 1:]
    os.execvp(args[0], args)
elif name == 'git':
    args = args[2:]
    if args[0] == 'rev-parse': print((base / 'head').read_text())
    elif args[0] == 'checkout': (base / 'head').write_text(args[-1])
    elif args[0] == 'merge-base' and failure == 'unmerged': sys.exit(1)
elif name == 'pnpm':
    if pathlib.Path.cwd() != base / 'app': sys.exit(2)
    if failure == 'dependencies' and (base / 'head').read_text() == 'b' * 40:
        sys.exit(1)
elif name == 'systemctl':
    if args[0] == 'show': print('active' if failure == 'active' else 'inactive')
elif name == 'install':
    pathlib.Path(args[-1]).mkdir(parents=True, exist_ok=True)
"""
    )
    binary = tmp_path / "bin"
    binary.mkdir()
    for name in ("id", "runuser", "git", "pnpm", "systemctl", "install"):
        wrapper = binary / name
        wrapper.write_text(f'#!/bin/sh\nexec "{sys.executable}" "{fake}" {name} "$@"\n')
        wrapper.chmod(0o755)
    script = tmp_path / "promote.sh"
    script.write_text(
        (SCRIPTS / "promote-host.sh")
        .read_text()
        .replace("/srv/posvoji", str(base))
        .replace("/etc/posvoji", str(config_dir))
    )
    result = subprocess.run(
        ["bash", str(script), new],
        cwd=tmp_path,
        env={
            **os.environ,
            "PATH": str(binary) + os.pathsep + os.environ["PATH"],
            "FIXTURE_HOST": str(base),
            "FIXTURE_FAILURE": failure,
        },
        capture_output=True,
        text=True,
    )
    expected = old if failure else new
    assert (result.returncode == 0) == (not failure), result.stderr
    assert (base / "head").read_text() == expected
    assert config.read_text() == (
        f"POSVOJI_EXPECTED_SHA={expected}\nFIXTURE_VALUE=unchanged\n"
    )
    commands = (base / "commands").read_text()
    if failure != "unmerged":
        assert "systemctl start posvoji-crawl.timer posvoji-backup.timer" in commands
    assert not (repo / ".artifact-lock").exists()
