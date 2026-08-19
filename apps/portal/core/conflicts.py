"""Three way comparison between the crawl, the shelter and the baseline.

An override and the crawled value differ by definition, so comparing those
two says nothing. What matters is whether the crawl has *moved* since the
shelter recorded its correction. That takes three values per field:

    baseline  what the crawl said when the shelter recorded the correction
    crawled   what the crawl says now
    override  what the shelter set, and what still ships

baseline == crawled means the source has not moved and the correction still
applies cleanly. Anything else is reported here. The correction keeps winning
either way: this module detects and describes, it never decides.
"""

from dataclasses import dataclass
from typing import Any

from .dataset import Animal, crawled_values
from .models import AnimalOverride

# The source moved and still disagrees with the shelter. A human has to say
# which one is right.
MOVED = "moved"
# The source moved and now agrees with the shelter. The override is redundant
# and can be retired without changing what the site shows.
CAUGHT_UP = "caught-up"


@dataclass(frozen=True)
class Conflict:
    field: str
    kind: str
    baseline: Any
    crawled: Any
    override: Any


def conflicts_for(
    override: AnimalOverride,
    animal: Animal | None,
) -> list[Conflict]:
    """Every overridden field whose crawled value has moved off its baseline.

    An animal that is not in the dataset has no crawled value to compare, so
    it produces no conflicts. That is a separate state (see orphaned) and not
    something a shelter can resolve.
    """
    if animal is None:
        return []

    crawled = crawled_values(animal)
    baseline = override.baseline if isinstance(override.baseline, dict) else {}
    result: list[Conflict] = []

    for key, value in override.overridden_fields().items():
        # No baseline means the correction predates baseline tracking, or was
        # recorded before the animal was crawled. Nothing to compare against,
        # and guessing one would invent conflicts.
        if key not in baseline:
            continue
        now = crawled.get(key)
        if now == baseline[key]:
            continue
        result.append(
            Conflict(
                field=key,
                kind=CAUGHT_UP if now == value else MOVED,
                baseline=baseline[key],
                crawled=now,
                override=value,
            )
        )

    return result
