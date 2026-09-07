"""Animal listing and overrides for one shelter.

These routes correct what the crawl found, so they exist only for a shelter
the crawl is the origin of. A manual shelter writes the record itself and its
listings reach the dataset like any crawled animal, so an override on top of
one would give a single record two editing authorities. Those shelters get
404 here, the mirror of the answer they get on the listing routes.
"""

import logging
from typing import Annotated

from django.utils import timezone
from ninja import Path, Router
from ninja.errors import HttpError
from pydantic import ValidationError

from ..dataset import (
    animals_for_shelter,
    crawled_values,
    find_animal,
    is_animal_id_of,
    merge_animal,
)
from ..db import serialized_write
from ..models import COLUMN_BY_JSON_KEY, AnimalOverride, clean_text
from ..schemas import AnimalOut, AnimalOverrideIn
from ..security import require_shelter

logger = logging.getLogger(__name__)

router = Router()


@router.get("/shelters/{slug}/animals", response=list[AnimalOut])
def list_animals(request, slug: str):
    shelter = require_shelter(request, slug, ingestion="crawled")
    overrides = {
        override.animal_id: override
        for override in AnimalOverride.objects.filter(shelter=shelter)
    }
    items = []
    for animal in animals_for_shelter(shelter.slug):
        # Ninja validates the response as a whole, so one record the schema
        # cannot take would fail the whole list. Ingest validates what it
        # writes, so this is a guard against a hand-edited or truncated file,
        # not a second schema: the record is left out, never repaired.
        animal_id = animal.get("id")
        if not isinstance(animal_id, str):
            logger.warning("skipping a record of %s that has no id", shelter.slug)
            continue
        item = merge_animal(animal, overrides.get(animal_id))
        try:
            AnimalOut.model_validate(item)
        except ValidationError as error:
            problems = "; ".join(
                f"{'.'.join(str(part) for part in detail['loc'])}: {detail['msg']}"
                for detail in error.errors()
            )
            logger.warning("skipping record %s: %s", animal_id, problems)
            continue
        items.append(item)
    items.sort(key=lambda item: ((item["name"] or "").casefold(), item["id"] or ""))
    return items


@router.put("/shelters/{slug}/animals/{animal_id}", response=AnimalOut)
def upsert_override(
    request,
    slug: str,
    animal_id: Annotated[str, Path(max_length=200)],
    payload: AnimalOverrideIn,
):
    shelter = require_shelter(request, slug, ingestion="crawled")
    # Every id is <shelter slug>:<local id>. Anything else is not this
    # shelter's animal, so it gets the same answer as a stranger's slug
    # would, and no row is written for it.
    if not is_animal_id_of(shelter.slug, animal_id):
        raise HttpError(404, "animal not found")
    # Only the keys present in the request body are touched, so a partial
    # update leaves the other overrides alone.
    changes = payload.model_dump(exclude_unset=True)

    # The animal may not be in the dataset yet: the shelter can be ahead of
    # the crawl, and the override still has to stick.
    #
    # Two readings of it. The merged record is what the shelter sees and what
    # the response is built from; the crawled one is what the baseline
    # records. Read off the merged file, the baseline of an override the last
    # run already applied would be that override's own value.
    animal = find_animal(shelter.slug, animal_id)
    crawled_animal = find_animal(shelter.slug, animal_id, crawled=True)
    crawled = crawled_values(crawled_animal) if crawled_animal is not None else None

    # The whole read-modify-write cycle is one write. save() writes every
    # model field, so without this two partial requests can each overwrite the
    # other request's unrelated field and baseline entry.
    with serialized_write():
        override = (
            AnimalOverride.objects.select_for_update()
            .filter(shelter=shelter, animal_id=animal_id)
            .first()
        )
        if override is None:
            override = AnimalOverride(shelter=shelter, animal_id=animal_id)

        baseline = dict(override.baseline)
        for key, value in changes.items():
            cleaned = clean_text(value)
            setattr(override, COLUMN_BY_JSON_KEY[key], cleaned)
            # Record what the crawl says right now for the field being set, so a
            # later run can tell a source that has moved from a correction that
            # simply differs from the crawl. Clearing an override drops its
            # baseline with it, and re-setting a field re-takes the baseline,
            # which is how a shelter says "I still mean this".
            if cleaned is None or crawled is None:
                baseline.pop(key, None)
            else:
                baseline[key] = crawled[key]
        # baseline_at is when the baseline was read, so it moves only when
        # the baseline does. An empty body, or a field said again while the
        # crawl stands still, leaves the reading and its time as they were.
        if baseline != override.baseline:
            override.baseline = baseline
            override.baseline_at = timezone.now() if baseline else None

        # No stated value is no override. A row with nothing in it would only
        # carry an updated_at saying the shelter edited an animal it did not.
        # Dropping the local reference as well is what makes the answer below
        # the one an animal without an override gets.
        if override.is_empty():
            if override.pk is not None:
                override.delete()
            override = None
        elif changes:
            override.updated_by = request.user
            override.save()

    return merge_animal(animal or {"id": animal_id}, override)
