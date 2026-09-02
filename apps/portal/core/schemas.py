"""Request and response shapes.

Field names are camelCase because they mirror the dataset written by the
TypeScript ingest. Keeping the attribute names identical to the JSON keys
avoids an alias layer between the two sides.
"""

from datetime import date
from typing import Any

from ninja import Schema
from pydantic import ConfigDict, Field, field_validator

from .models import (
    ListingSpecies,
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
    city: str = ""
    # Which editor the workspace opens: a manual shelter writes listings, a
    # crawled one corrects what the crawl found.
    ingestion: str


class MeOut(Schema):
    email: str
    shelters: list[ShelterOut]


class CsrfOut(Schema):
    csrfToken: str


class RequestLinkIn(Schema):
    model_config = ConfigDict(extra="forbid")

    email: str = Field(max_length=254)


class VerifyIn(Schema):
    model_config = ConfigDict(extra="forbid")

    token: str = Field(max_length=512)


class DevShelterOut(ShelterOut):
    """One row of the development shelter picker.

    `registered` says whether `email` is the shelter's registry address or a
    stand in minted for a shelter the registry lists without one.
    """

    email: str
    registered: bool


class DevLoginIn(Schema):
    model_config = ConfigDict(extra="forbid")

    slug: str = Field(max_length=64)


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

    name: str | None = Field(default=None, max_length=200)
    shortDescription: str | None = Field(default=None, max_length=2000)
    status: OverrideStatus | None = None
    sex: OverrideSex | None = None
    breed: str | None = Field(default=None, max_length=200)
    birthDate: date | None = None
    approximateAgeMonths: int | None = Field(default=None, ge=0)
    size: OverrideSize | None = None
    energy: OverrideEnergy | None = None
    goodWithKids: OverrideCompatibility | None = None
    goodWithDogs: OverrideCompatibility | None = None
    goodWithCats: OverrideCompatibility | None = None
    apartmentOk: OverrideCompatibility | None = None
    specialNeeds: bool | None = None


class ListingIn(Schema):
    """One whole manual listing.

    There is no crawled record underneath, so this is not a partial update:
    every editable field is sent every time and an absent optional field means
    the shelter is not stating it. species and name are the only ones a
    listing cannot exist without.

    The vocabularies are the model's own TextChoices, and use_enum_values with
    validate_default keeps what comes out of validation a plain string, which
    is what the columns and the export payload carry.
    """

    model_config = ConfigDict(
        extra="forbid",
        use_enum_values=True,
        validate_default=True,
    )

    species: ListingSpecies
    name: str = Field(max_length=200)
    status: OverrideStatus = OverrideStatus.AVAILABLE
    sex: OverrideSex | None = None
    breed: str | None = Field(default=None, max_length=200)
    birthDate: date | None = None
    approximateAgeMonths: int | None = Field(default=None, ge=0)
    size: OverrideSize | None = None
    energy: OverrideEnergy | None = None
    goodWithKids: OverrideCompatibility | None = None
    goodWithDogs: OverrideCompatibility | None = None
    goodWithCats: OverrideCompatibility | None = None
    apartmentOk: OverrideCompatibility | None = None
    specialNeeds: bool | None = None
    shortDescription: str | None = Field(default=None, max_length=2000)

    @field_validator("name")
    @classmethod
    def name_is_not_blank(cls, value: str) -> str:
        # A listing is the whole record, so it cannot be nameless the way an
        # override can simply leave the crawled name alone.
        stripped = value.strip()
        if not stripped:
            raise ValueError("name must not be blank")
        return stripped


class ExportListingPhotoOut(Schema):
    """A photo as the ingest pipeline reads it: no id, url absolute."""

    url: str
    width: int
    height: int


class ListingPhotoOut(ExportListingPhotoOut):
    """The same photo for the editor, which addresses it by id."""

    id: int


class ExportListingOut(Schema):
    """One manual listing as the ingest pipeline reads it.

    The route serializes with exclude_none, so an optional field the shelter
    has not stated is absent from the payload rather than null.
    """

    providerId: str
    id: str
    species: str
    status: str
    name: str
    sex: str | None = None
    breed: str | None = None
    birthDate: str | None = None
    approximateAgeMonths: int | None = None
    size: str | None = None
    energy: str | None = None
    goodWithKids: str | None = None
    goodWithDogs: str | None = None
    goodWithCats: str | None = None
    apartmentOk: str | None = None
    specialNeeds: bool | None = None
    shortDescription: str | None = None
    photos: list[ExportListingPhotoOut]
    createdAt: str
    updatedAt: str


class ListingOut(ExportListingOut):
    """The export shape plus archivedAt, with each photo carrying its id.

    The same fields as the export by inheritance, so the two cannot drift.
    What differs is on the route, not here: this one is not serialized with
    exclude_none, because the editor has to be able to tell a field the
    shelter cleared from one it never filled in.
    """

    photos: list[ListingPhotoOut] = []
    archivedAt: str | None = None


class ExportListingsOut(Schema):
    """The manual listing feed.

    providers names every shelter this payload is answering for, whether or
    not it has listings. Without it an empty listings array is ambiguous: it
    could mean the manual shelters archived everything, or it could mean this
    portal does not consider them manual at all because Shelter.ingestion has
    drifted from policy.yaml. The ingest side is the one that has to tell
    those apart, because only the first is a removal.
    """

    generatedAt: str
    providers: list[str]
    listings: list[ExportListingOut]


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
