"""Offline checks for host status and private commit promotion."""

import importlib.util
import json
import os
import sys
from pathlib import Path
from unittest.mock import MagicMock

import pytest


def module(name):
    path = Path(__file__).resolve().parents[3] / "scripts" / f"{name}.py"
    spec = importlib.util.spec_from_file_location(name, path)
    loaded = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(loaded)
    return loaded


def test_job_failure_recovery_and_degraded_state():
    change = module("operations-status").transition
    document = {"version": 1}
    change(document, "crawl", "start", "2026-09-06T06:00:00Z")
    change(document, "backup", "start", "2026-09-06T06:01:00Z")
    change(document, "crawl", "finish", "2026-09-06T06:02:00Z", "oom-kill")
    assert document["jobs"]["crawl"]["state"] == "failed"
    assert "lastSuccessAt" not in document["jobs"]["crawl"]
    change(document, "crawl", "start", "2026-09-06T07:00:00Z")
    change(document, "crawl", "degraded", "2026-09-06T07:01:00Z")
    change(document, "crawl", "finish", "2026-09-06T07:02:00Z")
    assert document["jobs"]["crawl"]["state"] == "degraded"
    assert document["jobs"]["backup"]["state"] == "running"
    change(document, "crawl", "start", "2026-09-06T18:00:00Z")
    change(document, "crawl", "finish", "2026-09-06T18:02:00Z")
    assert document["jobs"]["crawl"]["state"] == "success"


def test_status_replacement_keeps_the_serving_directory_group(tmp_path, monkeypatch):
    operations = module("operations-status")
    if sys.platform == "win32":
        monkeypatch.setitem(sys.modules, "fcntl", MagicMock())
        monkeypatch.setattr(operations.os, "fchmod", MagicMock(), raising=False)
    elif groups := [gid for gid in os.getgroups() if gid != os.getgid()]:
        os.chown(tmp_path, -1, groups[0])
    group = tmp_path.stat().st_gid
    change_group = MagicMock(wraps=getattr(operations.os, "fchown", None))
    monkeypatch.setattr(operations.os, "fchown", change_group, raising=False)
    operations.record(tmp_path, "crawl", "start", "success")
    assert change_group.call_args.args[1:] == (-1, group)
    assert (tmp_path / "status.json").stat().st_gid == group
    assert (
        json.loads((tmp_path / "status.json").read_text())["jobs"]["crawl"]["state"]
        == "running"
    )


def test_promote_preserves_private_configuration_and_rejects_ambiguity(tmp_path):
    update = module("set-promoted-commit").update
    path = tmp_path / "crawl.env"
    path.write_text(
        "# fixture\nPORTAL_EXPORT_TOKEN=example-placeholder\nPOSVOJI_EXPECTED_SHA=old\n"
    )
    update(path, "a" * 40)
    assert (
        path.read_text()
        == "# fixture\nPORTAL_EXPORT_TOKEN=example-placeholder\nPOSVOJI_EXPECTED_SHA="
        + "a" * 40
        + "\n"
    )
    with pytest.raises(ValueError, match="full commit"):
        update(path, "main")
    path.write_text("POSVOJI_EXPECTED_SHA=first\nPOSVOJI_EXPECTED_SHA=second\n")
    before = path.read_bytes()
    with pytest.raises(ValueError, match="exactly one"):
        update(path, "b" * 40)
    assert path.read_bytes() == before
