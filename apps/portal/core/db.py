"""How the portal serializes a write.

One thing, stated once, for the three routes that read a row, decide from
what they read, and write it back.
"""

from collections.abc import Iterator
from contextlib import contextmanager

from django.db import transaction


@contextmanager
def serialized_write() -> Iterator[None]:
    """A block no other writer runs inside.

    Every connection opens its transactions IMMEDIATE (portal/settings.py),
    so SQLite takes the write lock at BEGIN rather than at the first write. A
    second writer then waits on PORTAL_DB_TIMEOUT and runs afterwards,
    instead of reading first and colliding with "database is locked". That is
    what makes a read-modify-write here safe: the transaction itself, not the
    row lock.

    Callers still ask for select_for_update inside the block. SQLite ignores
    it, so on this engine it does nothing and the code above is the whole
    story. It states which row is being taken, and it is what would carry the
    guarantee on an engine that honours it.
    """
    with transaction.atomic():
        yield
