"""Atomically update the private pin without logging or rewriting credentials."""

import os
import re
import stat
import sys
import tempfile
from pathlib import Path


def update(path, sha):
    if not re.fullmatch(r"[a-f0-9]{40}", sha):
        raise ValueError("use a full commit SHA")
    metadata = path.lstat()
    if not stat.S_ISREG(metadata.st_mode):
        raise ValueError("configuration must be a regular file")
    original = path.read_text()
    replaced, count = re.subn(
        r"(?m)^POSVOJI_EXPECTED_SHA=.*$", f"POSVOJI_EXPECTED_SHA={sha}", original
    )
    if count != 1:
        raise ValueError("configuration must have exactly one commit pin")
    fd, temporary = tempfile.mkstemp(prefix=".promotion-", dir=path.parent)
    try:
        with os.fdopen(fd, "w") as output:
            output.write(replaced)
            output.flush()
            os.fsync(output.fileno())
            os.chmod(temporary, stat.S_IMODE(metadata.st_mode))
            if hasattr(os, "fchown"):
                os.fchown(output.fileno(), metadata.st_uid, metadata.st_gid)
        os.replace(temporary, path)
    finally:
        Path(temporary).unlink(missing_ok=True)


if __name__ == "__main__":
    update(Path(sys.argv[1]), sys.argv[2])
