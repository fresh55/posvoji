from django.conf import settings
from django.db import models

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

    class Meta:
        ordering = ["name"]

    def __str__(self) -> str:
        return f"{self.name} ({self.slug})"


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
