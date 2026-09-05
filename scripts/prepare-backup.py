"""Prepare a consistent private archive for an encrypted copy to the maintainer PC.

The host archive is staging, not an off-server backup. No VM/storage service is
created. Only a successful PC pull makes this independent of the host disk.
"""

import argparse
import hashlib
import json
import os
import shutil
import sqlite3
import subprocess
import tarfile
import tempfile
import uuid
from contextlib import closing
from pathlib import Path


def copy_database(source: Path, destination: Path) -> None:
    if not source.is_file() or source.is_symlink():
        raise ValueError("portal database must be an existing regular file")
    with closing(
        sqlite3.connect(source.resolve().as_uri() + "?mode=ro", uri=True)
    ) as db:
        with closing(sqlite3.connect(destination)) as backup:
            db.backup(backup)
            if backup.execute("PRAGMA integrity_check").fetchall() != [("ok",)]:
                raise ValueError("SQLite backup failed its integrity check")


def copy_regular_tree(source: Path, destination: Path) -> None:
    """Never follow a cache symlink into unrelated files or credentials."""
    if source.is_symlink() or not source.is_dir():
        raise ValueError("backup source must be a real directory")
    destination.mkdir()
    for entry in source.iterdir():
        target = destination / entry.name
        if entry.is_symlink():
            raise ValueError("backup source contains a symlink")
        if entry.is_dir():
            copy_regular_tree(entry, target)
        elif entry.is_file():
            shutil.copyfile(entry, target)
        else:
            raise ValueError("backup source contains a special file")


def prepare(
    repo: Path, database: Path, output: Path, portal_media: Path | None = None
) -> dict:
    repo = repo.resolve(strict=True)
    output.mkdir(parents=True, exist_ok=True, mode=0o700)
    if output.is_symlink():
        raise ValueError("backup output must not be a symlink")
    output = output.resolve(strict=True)
    os.chmod(output, 0o700)
    scripts = repo / "scripts"
    lock = repo / ".artifact-lock"
    with tempfile.TemporaryDirectory(prefix=".backup-stage-", dir=output) as temporary:
        stage = Path(temporary)
        token_file = stage / "lock-token"
        subprocess.run(
            [
                "node",
                str(scripts / "artifact-lock.mjs"),
                "acquire",
                str(lock),
                "backup",
                str(token_file),
            ],
            check=True,
        )
        token = token_file.read_text().strip()
        try:
            subprocess.run(
                [
                    "node",
                    str(scripts / "snapshot-generation.mjs"),
                    str(repo / "data/dist"),
                    str(repo / "apps/web/public/media"),
                    str(stage / "generation"),
                ],
                check=True,
                stdout=subprocess.DEVNULL,
            )
            # Preserve ordering authority and independently completed providers,
            # including progress not yet present in the final generation.
            for name in ("input-revision.json", "crawl-state.json"):
                source = repo / "data/dist" / name
                if source.exists():
                    if source.is_symlink() or not source.is_file():
                        raise ValueError("invalid crawl-state backup source")
                    shutil.copyfile(source, stage / "generation/dist" / name)
            source = repo / "data/dist/provider-snapshots"
            if source.exists():
                copy_regular_tree(source, stage / "generation/dist/provider-snapshots")
        finally:
            subprocess.run(
                [
                    "node",
                    str(scripts / "artifact-lock.mjs"),
                    "release",
                    str(lock),
                    token,
                ],
                check=True,
            )
        token_file.unlink()
        copy_database(database, stage / "portal.sqlite3")
        if portal_media is not None:
            copy_regular_tree(portal_media, stage / "portal-media")
        receipt = json.loads((stage / "generation/dist/generation.json").read_text())
        metadata = {
            "version": 1,
            "generationId": receipt["generationId"],
            "codeSha": subprocess.check_output(
                ["git", "rev-parse", "HEAD"], cwd=repo, text=True
            ).strip(),
        }
        (stage / "backup.json").write_text(json.dumps(metadata))
        name = f"backup-{uuid.uuid4().hex}.tar"
        pending = output / f".{name}.partial"
        try:
            with tarfile.open(pending, "w", dereference=True) as archive:
                for entry in sorted(stage.iterdir()):
                    archive.add(entry, arcname=entry.name)
            with pending.open("rb") as stream:
                digest = hashlib.file_digest(stream, "sha256").hexdigest()
            pending.replace(output / name)
            pointer = {**metadata, "file": name, "sha256": digest}
            pointer_tmp = output / f".latest-{uuid.uuid4().hex}.json"
            pointer_tmp.write_text(json.dumps(pointer))
            pointer_tmp.replace(output / "latest.json")
        finally:
            pending.unlink(missing_ok=True)
        # Keep the three latest complete archives, including the pointer target.
        previous = sorted(
            output.glob("backup-*.tar"), key=lambda p: p.stat().st_mtime, reverse=True
        )
        for old in previous[3:]:
            if old.name != name and old.is_file() and not old.is_symlink():
                old.unlink()
        return pointer


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--repo", type=Path, required=True)
    parser.add_argument("--database", type=Path, required=True)
    parser.add_argument("--output", type=Path, required=True)
    parser.add_argument(
        "--portal-media", type=Path, default=os.environ.get("PORTAL_MEDIA_ROOT") or None
    )
    args = parser.parse_args()
    os.umask(0o077)
    prepare(args.repo, args.database, args.output, args.portal_media)
    print("consistent backup archive prepared for off-server transfer")


if __name__ == "__main__":
    main()
