import uuid
from datetime import UTC, datetime

from django.conf import settings
from django.db import models


def iso_utc(value: datetime) -> str:
    """A timestamp in the one format the ingest contract accepts."""
    return value.astimezone(UTC).isoformat(timespec="seconds").replace("+00:00", "Z")


# Override column -> key used in the JSON API and in the ingest export. The
# dataset is written by TypeScript, so the wire format stays camelCase.
OVERRIDE_FIELDS: tuple[tuple[str, str], ...] = (
    ("name", "name"),
    ("short_description", "shortDescription"),
    ("status", "status"),
    ("sex", "sex"),
    ("breed", "breed"),
    ("birth_date", "birthDate"),
    ("approximate_age_months", "approximateAgeMonths"),
    ("size", "size"),
    ("energy", "energy"),
    ("good_with_kids", "goodWithKids"),
    ("good_with_dogs", "goodWithDogs"),
    ("good_with_cats", "goodWithCats"),
    ("apartment_ok", "apartmentOk"),
    ("special_needs", "specialNeeds"),
)

COLUMN_BY_JSON_KEY: dict[str, str] = {key: column for column, key in OVERRIDE_FIELDS}


# Listing column -> key on the wire, in the order the export contract lists
# the optional fields. species, status and name are always present and are
# handled apart from these.
LISTING_OPTIONAL_FIELDS: tuple[tuple[str, str], ...] = (
    ("sex", "sex"),
    ("breed", "breed"),
    ("birth_date", "birthDate"),
    ("approximate_age_months", "approximateAgeMonths"),
    ("size", "size"),
    ("energy", "energy"),
    ("good_with_kids", "goodWithKids"),
    ("good_with_dogs", "goodWithDogs"),
    ("good_with_cats", "goodWithCats"),
    ("apartment_ok", "apartmentOk"),
    ("special_needs", "specialNeeds"),
    ("short_description", "shortDescription"),
)

LISTING_COLUMN_BY_JSON_KEY: dict[str, str] = {
    "species": "species",
    "status": "status",
    "name": "name",
    **{key: column for column, key in LISTING_OPTIONAL_FIELDS},
}


class IngestionMode(models.TextChoices):
    """How a shelter's animals reach the pipeline.

    The same vocabulary as `ingestion` in providers/<slug>/policy.yaml, which
    is where seed_shelters reads it from. Only a manual shelter may write
    listings here: for any other mode the crawl is the origin of the record,
    and a listing would duplicate the animal on the next run.
    """

    SCRAPE = "scrape", "scrape"
    API = "api", "api"
    RSS = "rss", "rss"
    MANUAL = "manual", "manual"


class ListingSpecies(models.TextChoices):
    DOG = "dog", "dog"
    CAT = "cat", "cat"
    RABBIT = "rabbit", "rabbit"
    OTHER = "other", "other"


class OverrideStatus(models.TextChoices):
    AVAILABLE = "available", "available"
    RESERVED = "reserved", "reserved"
    ADOPTED = "adopted", "adopted"
    HOLD = "hold", "hold"


class OverrideSex(models.TextChoices):
    MALE = "male", "male"
    FEMALE = "female", "female"
    UNKNOWN = "unknown", "unknown"


class OverrideSize(models.TextChoices):
    SMALL = "small", "small"
    MEDIUM = "medium", "medium"
    LARGE = "large", "large"


class OverrideEnergy(models.TextChoices):
    """How much the animal wants to do in a day.

    Almost no shelter site states this in a form the crawler can read, so for
    most animals the portal is the only source for it.
    """

    CALM = "calm", "calm"
    BALANCED = "balanced", "balanced"
    LIVELY = "lively", "lively"


class OverrideCompatibility(models.TextChoices):
    """Answer to "does this animal get on with X".

    "unknown" is a real answer the shelter can give. A NULL column means the
    question was never answered.
    """

    YES = "yes", "yes"
    NO = "no", "no"
    UNKNOWN = "unknown", "unknown"


class Shelter(models.Model):
    """A shelter from data/shelters.yaml. The slug is also the providerId."""

    slug = models.SlugField(max_length=64, unique=True)
    name = models.CharField(max_length=200)
    city = models.CharField(max_length=100, blank=True)
    # Mirrors providers/<slug>/policy.yaml. A shelter with no policy file has
    # no adapter either, so the default is the ordinary crawled case.
    ingestion = models.CharField(
        max_length=16,
        choices=IngestionMode.choices,
        default=IngestionMode.SCRAPE,
    )

    class Meta:
        ordering = ["name"]

    def __str__(self) -> str:
        return f"{self.name} ({self.slug})"

    @property
    def is_manual(self) -> bool:
        return self.ingestion == IngestionMode.MANUAL


class ShelterMembership(models.Model):
    """Links a login to a shelter. No membership means no portal access."""

    user = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.CASCADE,
        related_name="shelter_memberships",
    )
    shelter = models.ForeignKey(
        Shelter,
        on_delete=models.CASCADE,
        related_name="memberships",
    )
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        ordering = ["shelter__name", "user__email"]
        constraints = [
            models.UniqueConstraint(
                fields=["user", "shelter"],
                name="unique_user_shelter_membership",
            )
        ]

    def __str__(self) -> str:
        return f"{self.user} @ {self.shelter.slug}"


class AnimalOverride(models.Model):
    """Shelter edits layered on top of a crawled animal.

    Every column is nullable on purpose: NULL means the field is not
    overridden and the crawled value stands.
    """

    shelter = models.ForeignKey(
        Shelter,
        on_delete=models.CASCADE,
        related_name="animal_overrides",
    )
    animal_id = models.CharField(max_length=200)

    name = models.CharField(max_length=200, null=True, blank=True)
    short_description = models.TextField(null=True, blank=True)
    status = models.CharField(
        max_length=16,
        choices=OverrideStatus.choices,
        null=True,
        blank=True,
    )
    sex = models.CharField(
        max_length=16,
        choices=OverrideSex.choices,
        null=True,
        blank=True,
    )
    breed = models.CharField(max_length=200, null=True, blank=True)
    birth_date = models.DateField(null=True, blank=True)
    approximate_age_months = models.PositiveIntegerField(null=True, blank=True)
    size = models.CharField(
        max_length=16,
        choices=OverrideSize.choices,
        null=True,
        blank=True,
    )
    energy = models.CharField(
        max_length=16,
        choices=OverrideEnergy.choices,
        null=True,
        blank=True,
    )
    good_with_kids = models.CharField(
        max_length=16,
        choices=OverrideCompatibility.choices,
        null=True,
        blank=True,
    )
    good_with_dogs = models.CharField(
        max_length=16,
        choices=OverrideCompatibility.choices,
        null=True,
        blank=True,
    )
    good_with_cats = models.CharField(
        max_length=16,
        choices=OverrideCompatibility.choices,
        null=True,
        blank=True,
    )
    apartment_ok = models.CharField(
        max_length=16,
        choices=OverrideCompatibility.choices,
        null=True,
        blank=True,
    )
    # NULL means not overridden, same as every other field here. True and
    # False are both real answers; there is no third "no" state to model
    # because a shelter either flags the need for extra care or has not.
    special_needs = models.BooleanField(null=True, blank=True)

    # What the crawl said for each overridden field at the moment the shelter
    # corrected it, keyed camelCase like the wire format. A field is present
    # with None when the crawl stated nothing for it then; a field is absent
    # when there was nothing to read at all, because the animal was not in
    # the dataset yet. Without this there is no way to tell a source that has
    # since moved from a correction that simply differs from the crawl.
    baseline = models.JSONField(default=dict, blank=True)
    baseline_at = models.DateTimeField(null=True, blank=True)

    updated_at = models.DateTimeField(auto_now=True)
    updated_by = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name="animal_overrides",
    )

    class Meta:
        ordering = ["shelter__slug", "animal_id"]
        constraints = [
            models.UniqueConstraint(
                fields=["shelter", "animal_id"],
                name="unique_shelter_animal_override",
            )
        ]

    def __str__(self) -> str:
        return f"{self.shelter.slug}:{self.animal_id}"

    def overridden_fields(self) -> dict[str, object]:
        """The fields this shelter actually changed, keyed camelCase."""
        result: dict[str, object] = {}
        for column, key in OVERRIDE_FIELDS:
            value = getattr(self, column)
            if value is None:
                continue
            result[key] = value.isoformat() if column == "birth_date" else value
        return result


def listing_photo_name(listing_id, filename: str) -> str:
    """listings/<listing id>/<content hash>.jpg, one directory per listing.

    Where a photo lands is a function of the listing and the bytes, so an
    upload of bytes already on this listing resolves to the name already
    stored. That is what lets the route recognise a duplicate before it
    writes anything.
    """
    return f"listings/{listing_id}/{filename}"


def listing_photo_path(instance: "ListingPhoto", filename: str) -> str:
    return listing_photo_name(instance.listing_id, filename)


class Listing(models.Model):
    """An animal a manual shelter writes here rather than publishing itself.

    This is not an override. There is no crawled record underneath, so the row
    holds the whole animal and a NULL column means the shelter has not stated
    that field, not that the crawl's value stands.

    The primary key is minted here and never reused: ingest builds the animal
    id as <providerId>:<uuid>, and a manual shelter has no crawled animals for
    that namespace to collide with.
    """

    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    shelter = models.ForeignKey(
        Shelter,
        on_delete=models.CASCADE,
        related_name="listings",
    )

    species = models.CharField(max_length=16, choices=ListingSpecies.choices)
    status = models.CharField(
        max_length=16,
        choices=OverrideStatus.choices,
        default=OverrideStatus.AVAILABLE,
    )
    name = models.CharField(max_length=200)

    sex = models.CharField(
        max_length=16,
        choices=OverrideSex.choices,
        null=True,
        blank=True,
    )
    breed = models.CharField(max_length=200, null=True, blank=True)
    birth_date = models.DateField(null=True, blank=True)
    approximate_age_months = models.PositiveIntegerField(null=True, blank=True)
    size = models.CharField(
        max_length=16,
        choices=OverrideSize.choices,
        null=True,
        blank=True,
    )
    energy = models.CharField(
        max_length=16,
        choices=OverrideEnergy.choices,
        null=True,
        blank=True,
    )
    good_with_kids = models.CharField(
        max_length=16,
        choices=OverrideCompatibility.choices,
        null=True,
        blank=True,
    )
    good_with_dogs = models.CharField(
        max_length=16,
        choices=OverrideCompatibility.choices,
        null=True,
        blank=True,
    )
    good_with_cats = models.CharField(
        max_length=16,
        choices=OverrideCompatibility.choices,
        null=True,
        blank=True,
    )
    apartment_ok = models.CharField(
        max_length=16,
        choices=OverrideCompatibility.choices,
        null=True,
        blank=True,
    )
    special_needs = models.BooleanField(null=True, blank=True)
    short_description = models.TextField(null=True, blank=True)

    # The shelter's delete. The row stays so its uuid is never handed out
    # again, leaves the export, and the next run removes the animal through
    # the same path a crawled animal leaves by.
    archived_at = models.DateTimeField(null=True, blank=True)

    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)
    created_by = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name="listings_created",
    )
    updated_by = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name="listings_updated",
    )

    class Meta:
        ordering = ["name", "id"]

    def __str__(self) -> str:
        return f"{self.name} ({self.shelter.slug})"

    def payload(self) -> dict[str, object]:
        """The listing in the export's shape.

        An optional field the shelter has not stated is absent, never null.
        That maps one to one onto the Animal schema's optional fields.
        """
        data: dict[str, object] = {
            "providerId": self.shelter.slug,
            "id": str(self.id),
            "species": self.species,
            "status": self.status,
            "name": self.name,
        }
        for column, key in LISTING_OPTIONAL_FIELDS:
            value = getattr(self, column)
            if value is None:
                continue
            data[key] = value.isoformat() if column == "birth_date" else value
        data["photos"] = [photo.payload() for photo in self.photos.all()]
        data["createdAt"] = iso_utc(self.created_at)
        data["updatedAt"] = iso_utc(self.updated_at)
        return data


class ListingPhoto(models.Model):
    """One re-encoded photograph of a listing.

    Nothing the shelter uploaded is stored. The portal writes its own JPEG,
    which is what drops the EXIF block and the GPS position in it, and names
    the file after the hash of the bytes it wrote.
    """

    listing = models.ForeignKey(
        Listing,
        on_delete=models.CASCADE,
        related_name="photos",
    )
    image = models.FileField(upload_to=listing_photo_path)
    width = models.PositiveIntegerField()
    height = models.PositiveIntegerField()
    # Upload order, which is display order. Deleting a photo leaves a gap
    # rather than renumbering the rest.
    position = models.PositiveIntegerField()
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        ordering = ["position", "id"]
        constraints = [
            models.UniqueConstraint(
                fields=["listing", "position"],
                name="unique_listing_photo_position",
            )
        ]

    def __str__(self) -> str:
        return f"{self.listing_id}#{self.position}"

    def payload(self) -> dict[str, object]:
        """The photo in the export's shape, with an absolute url."""
        return {
            "url": f"{settings.PORTAL_PUBLIC_URL}{self.image.url}",
            "width": self.width,
            "height": self.height,
        }
