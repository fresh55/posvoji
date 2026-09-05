"""Record job outcomes without publishing logs, paths, or credentials."""

import json
import os
import sys
import tempfile
from datetime import datetime, timezone
from pathlib import Path


def transition(document, job, event, at, result="success"):
    if job not in ("crawl", "backup") or event not in ("start", "finish", "degraded"):
        raise ValueError("invalid operations event")
    if document.get("version") != 1:
        raise ValueError("invalid operations status")
    entry = document.setdefault("jobs", {}).setdefault(job, {})
    if event == "start":
        entry.update(state="running", lastStartedAt=at, degraded=False)
    elif event == "degraded":
        entry["degraded"] = True
    elif result == "success":
        entry.update(
            state="degraded" if entry.get("degraded") else "success",
            lastSuccessAt=at,
        )
    else:
        entry.update(state="failed", lastFailureAt=at)
    return document


def record(directory, job, event, result):
    # Host only. A stable lock inode serializes crawl and backup updates; atomic
    # replacement lets Caddy readers see one complete document without locking.
    import fcntl

    with (directory / ".status.lock").open("a") as lock:
        fcntl.flock(lock, fcntl.LOCK_EX)
        path = directory / "status.json"
        document = json.loads(path.read_text()) if path.exists() else {"version": 1}
        transition(document, job, event, datetime.now(timezone.utc).isoformat(), result)
        fd, name = tempfile.mkstemp(prefix=".status-", dir=directory)
        try:
            with os.fdopen(fd, "w") as output:
                json.dump(document, output)
                output.flush()
                os.fsync(output.fileno())
                os.fchmod(output.fileno(), 0o640)
            os.replace(name, path)
        finally:
            Path(name).unlink(missing_ok=True)


if __name__ == "__main__":
    record(
        Path("/srv/posvoji/operations"),
        sys.argv[1],
        sys.argv[2],
        os.environ.get("SERVICE_RESULT", "unknown"),
    )
