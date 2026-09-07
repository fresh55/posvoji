from django.db import migrations, models


def mark_existing_as_registry(apps, schema_editor):
    """Every membership in production so far came from seed_shelters.

    The column arrives with the "admin" default, which is right for rows the
    admin form makes from here on. No row that exists when this runs was made
    that way: the seed was the only thing creating memberships, and the
    development login that also makes them cannot be switched on outside
    DEBUG.
    """
    membership = apps.get_model("core", "ShelterMembership")
    membership.objects.update(source="registry")


def keep_the_column_as_it_is(apps, schema_editor):
    """Nothing to undo. Reversing the AddField drops the column anyway."""


class Migration(migrations.Migration):
    dependencies = [
        ("core", "0006_shelter_ingestion_listing_listingphoto"),
    ]

    operations = [
        migrations.AddField(
            model_name="sheltermembership",
            name="source",
            field=models.CharField(
                choices=[
                    ("registry", "registry"),
                    ("admin", "admin"),
                    ("dev", "dev"),
                ],
                default="admin",
                max_length=16,
            ),
        ),
        migrations.RunPython(
            mark_existing_as_registry,
            keep_the_column_as_it_is,
        ),
    ]
