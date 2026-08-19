"""Read side of the crawled dataset.

data/dist/animals.json is written by apps/ingest. The portal only reads it,
never writes it, and keeps working when the file is missing because the
pipeline may not have run yet.
"""

import json
import logging
from pathlib import Path
from typing import Any

from django.conf import settings

from .models import OVERRIDE_FIELDS, AnimalOverride

logger = logging.getLogger(__name__)

Animal = dict[str, Any]


def dataset_path() -> Path:
    return Path(settings.DATASET_PATH)


def load_animals() -> list[Animal]:
    path = dataset_path()
    try:
        raw = json.loads(path.read_text(encoding="utf-8"))
    except FileNotFoundError:
        return []
    except (OSError, ValueError):
        logger.exception("unreadable dataset at %s", path)
        return []

    animals = raw.get("animals") if isinstance(raw, dict) else raw
    if not isinstance(animals, list):
        return []
    return [animal for animal in animals if isinstance(animal, dict)]


def animals_for_shelter(slug: str) -> list[Animal]:
    result = []
    for animal in load_animals():
        shelter = animal.get("shelter")
        if isinstance(shelter, dict) and shelter.get("id") == slug:
            result.append(animal)
    return result


def find_animal(slug: str, animal_id: str) -> Animal | None:
    for animal in animals_for_shelter(slug):
        if animal.get("id") == animal_id:
            return animal
    return None


def animal_index() -> dict[tuple[str, str], Animal]:
    """Every crawled animal keyed by (shelter slug, animal id).

    One read of the dataset for a caller that has to look up many animals,
    such as the admin changelist. find_animal re-reads the file per call and
    is only worth it for a single lookup.
    """
    index: dict[tuple[str, str], Animal] = {}
    for animal in load_animals():
        shelter = animal.get("shelter")
        animal_id = animal.get("id")
        if not isinstance(shelter, dict) or not isinstance(animal_id, str):
            continue
        slug = shelter.get("id")
        if isinstance(slug, str):
            index[(slug, animal_id)] = animal
    return index


def thumbnail_url(animal: Animal) -> str | None:
    images = animal.get("images")
    if not isinstance(images, list):
        return None
    for image in images:
        if not isinstance(image, dict):
            continue
        url = image.get("cachedUrl") or image.get("sourceUrl")
        if url:
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
    """What the crawl says for every overridable field, keyed camelCase.

    A field the crawl has no value for is present with None, so a caller can
    tell "the crawl states nothing here" from "this field was never read".
    """
    values: dict[str, Any] = {key: animal.get(key) for _, key in OVERRIDE_FIELDS}
    values["goodWithKids"] = good_with(animal, "kids")
    values["goodWithDogs"] = good_with(animal, "dogs")
    values["goodWithCats"] = good_with(animal, "cats")
    return values


def merge_animal(animal: Animal, override: AnimalOverride | None) -> dict[str, Any]:
    """Crawled values with the shelter's overrides applied on top."""
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
