"""Drops override rows with nothing stated.

Until the override route learned to delete a row it had emptied, a PUT that
cleared the last field, or an empty PUT on an unknown id, left a row with
every override column NULL. Such a row says nothing, is skipped by the
export and never listed, but it sits in the admin and can carry a stale
baseline. The route and the admin now delete these as they go; this clears
the ones already there.
"""

from django.db import migrations

# The override columns as of 0006. Listed here rather than imported from
# models, so the migration keeps meaning the same thing if the model grows.
OVERRIDE_COLUMNS = (
    "name",
    "short_description",
    "status",
    "sex",
    "breed",
    "birth_date",
    "approximate_age_months",
    "size",
    "energy",
    "good_with_kids",
    "good_with_dogs",
    "good_with_cats",
    "apartment_ok",
    "special_needs",
)


def drop_empty_overrides(apps, schema_editor):
    AnimalOverride = apps.get_model("core", "AnimalOverride")
    empty = {f"{column}__isnull": True for column in OVERRIDE_COLUMNS}
    AnimalOverride.objects.filter(**empty).delete()


class Migration(migrations.Migration):
    dependencies = [
        ("core", "0006_shelter_ingestion_listing_listingphoto"),
    ]

    operations = [
        migrations.RunPython(drop_empty_overrides, migrations.RunPython.noop),
    ]
