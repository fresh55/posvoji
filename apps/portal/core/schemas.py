"""Request and response shapes.

Field names are camelCase because they mirror the dataset written by the
TypeScript ingest. Keeping the attribute names identical to the JSON keys
avoids an alias layer between the two sides.
"""

from datetime import date
from typing import Any

from ninja import Schema
from pydantic import ConfigDict, Field

from .models import (
    OverrideCompatibility,
    OverrideEnergy,
    OverrideSex,
    OverrideSize,
    OverrideStatus,
)


class ErrorOut(Schema):
    detail: str


class ShelterOut(Schema):
    slug: str
    name: str


class MeOut(Schema):
    email: str
    shelters: list[ShelterOut]


class RequestLinkIn(Schema):
    model_config = ConfigDict(extra="forbid")

    email: str = Field(max_length=254)


class VerifyIn(Schema):
    model_config = ConfigDict(extra="forbid")

    token: str = Field(max_length=512)


class AnimalOut(Schema):
    id: str
    species: str | None = None
    status: str | None = None
    name: str | None = None
    breed: str | None = None
    sex: str | None = None
    birthDate: str | None = None
    approximateAgeMonths: int | None = None
    size: str | None = None
    energy: str | None = None
    shortDescription: str | None = None
    goodWithKids: str | None = None
    goodWithDogs: str | None = None
    goodWithCats: str | None = None
    apartmentOk: str | None = None
    specialNeeds: bool | None = None
    thumbnailUrl: str | None = None
    overrides: dict[str, Any] = {}


class AnimalOverrideIn(Schema):
    """Partial override update.

    Unknown keys are rejected. A field that is absent stays as it is, an
    explicit null clears the override and restores the crawled value.

    The vocabularies are the model's own TextChoices. upsert_override writes
    with setattr and save(), which runs no model validation, so this schema is
    the only gate on those values and must not hold a second copy of them.
    use_enum_values keeps what comes out of validation a plain string, which
    is what the columns and the export payload carry.
    """

    model_config = ConfigDict(extra="forbid", use_enum_values=True)

    name: str | None = None
    shortDescription: str | None = None
    status: OverrideStatus | None = None
    sex: OverrideSex | None = None
    breed: str | None = None
    birthDate: date | None = None
    approximateAgeMonths: int | None = Field(default=None, ge=0)
    size: OverrideSize | None = None
    energy: OverrideEnergy | None = None
    goodWithKids: OverrideCompatibility | None = None
    goodWithDogs: OverrideCompatibility | None = None
    goodWithCats: OverrideCompatibility | None = None
    apartmentOk: OverrideCompatibility | None = None
    specialNeeds: bool | None = None


class ExportOverrideOut(Schema):
    """One animal's corrections as the ingest pipeline reads them.

    baseline holds what the crawl said for those same fields when the shelter
    recorded them, so ingest can report a source that has moved since. It is
    absent when there was no crawled animal to read at the time. Its values
    may be null, which means the crawl stated nothing for that field then.
    """

    providerId: str
    animalId: str
    fields: dict[str, Any]
    baseline: dict[str, Any] | None = None
    recordedAt: str | None = None


class ExportOut(Schema):
    generatedAt: str
    overrides: list[ExportOverrideOut]
