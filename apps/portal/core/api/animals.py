"""Animal listing and overrides for one shelter.

These routes correct what the crawl found, so they exist only for a shelter
the crawl is the origin of. A manual shelter writes the record itself and its
listings reach the dataset like any crawled animal, so an override on top of
one would give a single record two editing authorities. Those shelters get
404 here, the mirror of the answer they get on the listing routes.
"""

from typing import Annotated

from django.db import transaction
from django.utils import timezone
from ninja import Path, Router

from ..dataset import (
    animals_for_shelter,
    crawled_values,
    find_animal,
    merge_animal,
)
from ..models import COLUMN_BY_JSON_KEY, AnimalOverride, clean_text
from ..schemas import AnimalOut, AnimalOverrideIn
from ..security import require_shelter

router = Router()


@router.get("/shelters/{slug}/animals", response=list[AnimalOut])
def list_animals(request, slug: str):
    shelter = require_shelter(request, slug, ingestion="crawled")
    overrides = {
        override.animal_id: override
        for override in AnimalOverride.objects.filter(shelter=shelter)
    }
    items = [
        merge_animal(animal, overrides.get(animal.get("id")))
        for animal in animals_for_shelter(shelter.slug)
    ]
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
    # Only the keys present in the request body are touched, so a partial
    # update leaves the other overrides alone.
    changes = payload.model_dump(exclude_unset=True)

    # The animal may not be in the dataset yet: the shelter can be ahead of
    # the crawl, and the override still has to stick.
    animal = find_animal(shelter.slug, animal_id)
    crawled = crawled_values(animal) if animal is not None else None

    # Serialize the whole read-modify-write cycle. save() writes every model
    # field, so without the row lock two partial requests can each overwrite
    # the other request's unrelated field and baseline entry.
    with transaction.atomic():
        override, _ = AnimalOverride.objects.select_for_update().get_or_create(
            shelter=shelter, animal_id=animal_id
        )

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
        override.baseline = baseline
        override.baseline_at = timezone.now() if baseline else None
        override.updated_by = request.user
        override.save()

    return merge_animal(animal or {"id": animal_id}, override)
