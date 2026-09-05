"""Offline regression coverage for the host's application-consistent backups."""

import hashlib
import importlib.util
import json
import shutil
import sqlite3
import subprocess
import tarfile
from pathlib import Path

import pytest

SCRIPT = Path(__file__).resolve().parents[3] / "scripts" / "prepare-backup.py"
SPEC = importlib.util.spec_from_file_location("prepare_backup", SCRIPT)
backup_module = importlib.util.module_from_spec(SPEC)
SPEC.loader.exec_module(backup_module)


def test_backup_reads_committed_wal_and_is_independent(tmp_path):
    source = tmp_path / "source.sqlite3"
    destination = tmp_path / "backup.sqlite3"
    with sqlite3.connect(source) as db:
        db.execute("PRAGMA journal_mode=WAL")
        db.execute("CREATE TABLE marker (revision INTEGER)")
        db.execute("INSERT INTO marker VALUES (7)")
        db.commit()
        backup_module.copy_database(source, destination)
        db.execute("UPDATE marker SET revision=8")
        db.commit()
    with sqlite3.connect(destination) as restored:
        assert restored.execute("SELECT revision FROM marker").fetchone() == (7,)
        assert restored.execute("PRAGMA integrity_check").fetchone() == ("ok",)


def test_missing_database_does_not_create_an_empty_backup(tmp_path):
    destination = tmp_path / "backup.sqlite3"
    with pytest.raises(ValueError, match="existing regular file"):
        backup_module.copy_database(tmp_path / "missing.sqlite3", destination)
    assert not destination.exists()


def test_tree_copy_keeps_original_independent(tmp_path):
    source = tmp_path / "source"
    source.mkdir()
    (source / "manifest.json").write_text('{"revision":7}')
    destination = tmp_path / "copied"
    backup_module.copy_regular_tree(source, destination)
    (source / "manifest.json").write_text('{"revision":8}')
    assert (destination / "manifest.json").read_text() == '{"revision":7}'


def test_archive_restores_database_generation_media_and_revision(tmp_path):
    repo = tmp_path / "repo"
    scripts = repo / "scripts"
    scripts.mkdir(parents=True)
    for helper in SCRIPT.parent.glob("*.mjs"):
        shutil.copyfile(helper, scripts / helper.name)
    # Only rev-parse reads this metadata; all generated state stays in tmp_path.
    git_dir = subprocess.check_output(
        ["git", "rev-parse", "--absolute-git-dir"], cwd=SCRIPT.parent, text=True
    ).strip()
    (repo / ".git").write_text(f"gitdir: {git_dir}\n")
    dist = repo / "data/dist"
    dist.mkdir(parents=True)
    media = repo / "apps/web/public/media"
    (media / "shelter-logos").mkdir(parents=True)
    (media / "shelter-logos/fixture.svg").write_text("fixture-logo-bytes")
    at = "2026-09-02T00:00:00.000Z"
    artifacts = {
        "animals.json": {"generatedAt": at, "animals": []},
        "animals.crawled.json": {"generatedAt": at, "animals": []},
        "overrides.json": {"generatedAt": at, "enabled": False},
        "image-cache.json": {"entries": {}},
        "share-cards.json": {"entries": {}},
        "shelter-logos.json": {"entries": {"fixture": {"file": "fixture.svg"}}},
        "input-revision.json": {"authority": "a" * 64, "sequence": 9},
    }
    for name, value in artifacts.items():
        (dist / name).write_text(json.dumps(value))
    subprocess.run(
        [
            "node",
            "--input-type=module",
            "-e",
            "import {createGenerationReceipt} from './scripts/generation-receipt.mjs';"
            "import {writeFileSync} from 'node:fs';"
            "writeFileSync('data/dist/generation.json', JSON.stringify("
            "createGenerationReceipt({distDir:'data/dist',mediaRoot:'apps/web/public/media'})));",
        ],
        cwd=repo,
        check=True,
    )
    source_db = tmp_path / "portal.sqlite3"
    with sqlite3.connect(source_db) as db:
        db.execute("CREATE TABLE marker (revision INTEGER)")
        db.execute("INSERT INTO marker VALUES (9)")
    uploads = tmp_path / "uploads"
    uploads.mkdir()
    (uploads / "fixture.txt").write_text("fixture-upload")
    output = tmp_path / "archives"
    pointer = backup_module.prepare(repo, source_db, output, uploads)
    archive = output / pointer["file"]
    assert hashlib.sha256(archive.read_bytes()).hexdigest() == pointer["sha256"]
    restored = tmp_path / "restored"
    restored.mkdir()
    with tarfile.open(archive) as saved:
        saved.extractall(restored, filter="data")
    with sqlite3.connect(restored / "portal.sqlite3") as db:
        assert db.execute("SELECT revision FROM marker").fetchone() == (9,)
    assert (
        json.loads((restored / "generation/dist/input-revision.json").read_text())
        == artifacts["input-revision.json"]
    )
    assert (restored / "portal-media/fixture.txt").read_text() == "fixture-upload"
    subprocess.run(
        [
            "node",
            "--input-type=module",
            "-e",
            "import {validateGenerationReceipt} "
            "from './scripts/generation-receipt.mjs';"
            "validateGenerationReceipt({distDir:process.argv[1],mediaRoot:process.argv[2]});",
            str(restored / "generation/dist"),
            str(restored / "generation/media"),
        ],
        cwd=repo,
        check=True,
    )
    assert not (repo / ".artifact-lock").exists()
