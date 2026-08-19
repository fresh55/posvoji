"""Request and response shapes.

Field names are camelCase because they mirror the dataset written by the
TypeScript ingest. Keeping the attribute names identical to the JSON keys
avoids an alias layer between the two sides.
"""

from datetime import date
from typing import Any, Literal

from ninja import Schema
from pydantic import ConfigDict, Field


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
    thumbnailUrl: str | None = None
    overrides: dict[str, Any] = {}


class AnimalOverrideIn(Schema):
    """Partial override update.

    Unknown keys are rejected. A field that is absent stays as it is, an
    explicit null clears the override and restores the crawled value.
    """

    model_config = ConfigDict(extra="forbid")

    name: str | None = None
    shortDescription: str | None = None
    status: Literal["available", "reserved", "adopted", "hold"] | None = None
    sex: Literal["male", "female", "unknown"] | None = None
    breed: str | None = None
    birthDate: date | None = None
    approximateAgeMonths: int | None = Field(default=None, ge=0)
    size: Literal["small", "medium", "large"] | None = None
    energy: Literal["calm", "balanced", "lively"] | None = None
    goodWithKids: Literal["yes", "no", "unknown"] | None = None
    goodWithDogs: Literal["yes", "no", "unknown"] | None = None
    goodWithCats: Literal["yes", "no", "unknown"] | None = None


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
