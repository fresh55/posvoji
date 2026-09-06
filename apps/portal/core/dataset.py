"""Read side of the crawled dataset.

apps/ingest writes two files per run. data/dist/animals.json is what the
site reads: the crawl with the shelters' overrides merged in.
data/dist/animals.crawled.json is the same run's records before any override
was merged. The portal only reads them, never writes them, and keeps working
when a file is missing because the pipeline may not have run yet.

Which file a caller wants depends on its question. "What should the shelter
see" is the merged one, so the listing reads DATASET_PATH. "What does the
crawl say" is the crawled one, so a baseline and a conflict read
CRAWLED_DATASET_PATH: read off the merged file, the baseline of an override
the last run applied would be the override's own value, and a run that merely
carried the correction forward would look like a crawl that caught up.
"""

import json
import logging
import unicodedata
from pathlib import Path
from typing import Any

from django.conf import settings

from .models import OVERRIDE_FIELDS, AnimalOverride

logger = logging.getLogger(__name__)

Animal = dict[str, Any]

# The parsed datasets, one per path, each keyed by the file's modification
# time and size. The files are written by another process, so the mtime is
# what says a parsed copy is out of date. A missing file caches nothing and
# is simply re-checked.
_cache: dict[Path, tuple[tuple[int, int], list[Animal]]] = {}
# Whether the missing crawled file has been reported yet. Once per process
# is enough: the condition does not change between requests.
_fallback_reported = False


def dataset_path() -> Path:
    return Path(settings.DATASET_PATH)


def crawled_dataset_path() -> Path:
    return Path(settings.CRAWLED_DATASET_PATH)


def clear_cache() -> None:
    """Drops the parsed datasets.

    Needed by tests that rewrite a file within one clock tick of the
    previous write, where the mtime cannot show the change.
    """
    global _fallback_reported
    _cache.clear()
    _fallback_reported = False


def source_path(*, crawled: bool) -> Path:
    """The file to read: the merged view, or what the crawl said.

    A data/dist from before ingest wrote animals.crawled.json has only the
    merged file. Reading baselines off it is what every reading was made
    from until then, so it stands in, and the log says so once.
    """
    global _fallback_reported
    if not crawled:
        return dataset_path()
    path = crawled_dataset_path()
    if path.is_file():
        return path
    if not _fallback_reported:
        _fallback_reported = True
        logger.warning(
            "no crawled dataset at %s, reading what the crawl said from %s instead",
            path,
            dataset_path(),
        )
    return dataset_path()


def _parse(path: Path) -> list[Animal]:
    try:
        raw = json.loads(path.read_text(encoding="utf-8"))
    except (OSError, ValueError):
        logger.exception("unreadable dataset at %s", path)
        return []

    animals = raw.get("animals") if isinstance(raw, dict) else raw
    if not isinstance(animals, list):
        return []
    return [animal for animal in animals if isinstance(animal, dict)]


def load_animals(*, crawled: bool = False) -> list[Animal]:
    """The animals of one dataset, parsed once per version of the file.

    Callers read the whole dataset per request and sometimes per row, and the
    file runs to hundreds of kilobytes, so parsing it every time is the cost
    that matters here.
    """
    path = source_path(crawled=crawled)
    try:
        stat = path.stat()
    except FileNotFoundError:
        return []
    except OSError:
        logger.exception("unreadable dataset at %s", path)
        return []

    key = (stat.st_mtime_ns, stat.st_size)
    cached = _cache.get(path)
    if cached is not None and cached[0] == key:
        return cached[1]

    animals = _parse(path)
    _cache[path] = (key, animals)
    return animals


def animals_for_shelter(slug: str, *, crawled: bool = False) -> list[Animal]:
    result = []
    for animal in load_animals(crawled=crawled):
        shelter = animal.get("shelter")
        if isinstance(shelter, dict) and shelter.get("id") == slug:
            result.append(animal)
    return result


def find_animal(slug: str, animal_id: str, *, crawled: bool = False) -> Animal | None:
    for animal in animals_for_shelter(slug, crawled=crawled):
        if animal.get("id") == animal_id:
            return animal
    return None


def animal_index(*, crawled: bool = False) -> dict[tuple[str, str], Animal]:
    """Every animal of one dataset keyed by (shelter slug, animal id).

    One read of the dataset for a caller that has to look up many animals,
    such as the admin changelist. find_animal re-reads the file per call and
    is only worth it for a single lookup.
    """
    index: dict[tuple[str, str], Animal] = {}
    for animal in load_animals(crawled=crawled):
        shelter = animal.get("shelter")
        animal_id = animal.get("id")
        if not isinstance(shelter, dict) or not isinstance(animal_id, str):
            continue
        slug = shelter.get("id")
        if isinstance(slug, str):
            index[(slug, animal_id)] = animal
    return index


def is_animal_id_of(slug: str, animal_id: str) -> bool:
    """Whether an id can name one of this shelter's animals.

    Ingest builds every id as <shelter slug>:<local id>. An id with another
    prefix is another shelter's namespace whatever route it arrives on, and
    one with a control character in it is nothing a crawl could produce.
    The local id is not checked against the dataset: the shelter can be
    ahead of the crawl.
    """
    local_id = animal_id.removeprefix(f"{slug}:")
    if local_id == animal_id or not local_id:
        return False
    return not any(unicodedata.category(char) == "Cc" for char in animal_id)


def thumbnail_url(animal: Animal) -> str | None:
    """The first photo the portal may draw, respecting display/cache rights."""
    images = animal.get("images")
    if not isinstance(images, list):
        return None
    for image in images:
        if not isinstance(image, dict):
            continue
        rights = image.get("rights")
        if rights == "cache-permitted":
            url = image.get("cachedUrl") or image.get("sourceUrl")
        elif rights == "display-permitted":
            # Permission to hotlink is not permission to serve a cached copy,
            # even if malformed or stale input happens to carry cachedUrl.
            url = image.get("sourceUrl")
        else:
            continue
        if isinstance(url, str) and url:
            return url
    return None


def good_with(animal: Animal, group: str) -> str | None:
    """One answer out of the dataset's nested goodWith block.

    The dataset nests the three answers under "goodWith"; the API keeps them
    flat, one key per group, like every other overridable field.
    """
    block = animal.get("goodWith")
    if not isinstance(block, dict):
        return None
    value = block.get(group)
    return value if isinstance(value, str) else None


def crawled_values(animal: Animal) -> dict[str, Any]:
    """What one dataset record says for every overridable field, camelCase.

    A field the record has no value for is present with None, so a caller
    can tell "the crawl states nothing here" from "this field was never
    read". Pass a record from the crawled dataset when the answer has to be
    the crawl's own.
    """
    values: dict[str, Any] = {key: animal.get(key) for _, key in OVERRIDE_FIELDS}
    values["goodWithKids"] = good_with(animal, "kids")
    values["goodWithDogs"] = good_with(animal, "dogs")
    values["goodWithCats"] = good_with(animal, "cats")
    return values


def merge_animal(animal: Animal, override: AnimalOverride | None) -> dict[str, Any]:
    """A dataset record with the shelter's overrides applied on top.

    The record is usually one from the merged dataset, which already carries
    the overrides ingest applied on the last run. Applying the same values
    again changes nothing, and an override set or cleared since that run
    lands on top of it, which is the view the shelter expects.
    """
    overrides = override.overridden_fields() if override is not None else {}
    merged: dict[str, Any] = {
        "id": animal.get("id"),
        "species": animal.get("species"),
        **crawled_values(animal),
        "thumbnailUrl": thumbnail_url(animal),
    }
    merged.update(overrides)
    merged["overrides"] = overrides
    return merged
