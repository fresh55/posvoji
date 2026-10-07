"""Admin profile edits reach the feed without expanding the shelter editor."""

from types import SimpleNamespace

import pytest
from django.contrib.admin.sites import site
from django.core.exceptions import ValidationError
from django.utils import timezone

from core.admin import AnimalOverrideAdmin
from core.models import AnimalOverride
from core.schemas import AnimalOverrideIn

from .conftest import make_animal


@pytest.mark.django_db
def test_admin_profile_records_editor_and_source_baseline(
    rf, admin_user, shelter, dataset_file, client, settings
):
    original = make_animal("testno:profile", shelter, coatColor="brown")
    dataset_file([original], crawled=[original])
    row = AnimalOverride(
        shelter=shelter,
        animal_id=original["id"],
        coat_colors=["black", "white"],
        coat_color="black-white",
        coat_length="short",
        medical={"neutered": True},
        adoption_requirements={"indoorOnly": True},
    )
    row.full_clean()
    request = rf.post("/admin/core/animaloverride/add/")
    request.user = admin_user
    AnimalOverrideAdmin(AnimalOverride, site).save_model(
        request,
        row,
        SimpleNamespace(
            changed_data=[
                "coat_colors",
                "coat_color",
                "coat_length",
                "medical",
                "adoption_requirements",
            ]
        ),
        False,
    )
    row.refresh_from_db()
    assert row.updated_by == admin_user
    assert row.baseline["coatColor"] == "brown"
    assert row.baseline["coatColors"] is None
    assert row.baseline_at <= timezone.now()
    settings.PORTAL_EXPORT_TOKEN = "profile-token"
    entry = client.get("/api/export", HTTP_AUTHORIZATION="Bearer profile-token").json()[
        "overrides"
    ][0]
    assert entry["fields"]["coatColor"] == "black-white"
    assert entry["fields"]["medical"] == {"neutered": True}
    assert entry["fields"]["adoptionRequirements"] == {"indoorOnly": True}
    assert entry["baseline"]["coatColor"] == "brown"
    assert "coatColor" not in AnimalOverrideIn.model_fields


@pytest.mark.django_db
@pytest.mark.parametrize(
    "column,value",
    [
        ("coat_colors", ["black", "black"]),
        ("coat_colors", []),
        ("coat_colors", ["pink"]),
        ("medical", {"neutered": "yes"}),
        ("medical", {"phone": "unknown"}),
        ("adoption_requirements", {"indoorOnly": "yes"}),
        ("adoption_requirements", {"unknown": True}),
    ],
)
def test_invalid_admin_answers_fail_model_validation(shelter, column, value):
    row = AnimalOverride(shelter=shelter, animal_id="testno:1", **{column: value})
    with pytest.raises(ValidationError):
        row.full_clean()


@pytest.mark.django_db
def test_admin_form_has_profile_controls(admin_client):
    body = admin_client.get("/admin/core/animaloverride/add/").content.decode()
    for column in (
        "coat_color",
        "coat_colors",
        "coat_length",
        "medical",
        "adoption_requirements",
    ):
        assert f'id="id_{column}"' in body
