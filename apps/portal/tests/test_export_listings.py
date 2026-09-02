"""The manual listing feed, against the fixture the ingest side parses.

apps/ingest/fixtures/portal-listings.contract.json is the authoritative shape.
Both workspaces read it, so a field that moves on one side fails on the other.
"""

import io
import json
from datetime import date, datetime
from pathlib import Path

import pytest
from django.core.files.base import ContentFile
from django.utils import timezone
from PIL import Image

from core.models import (
    LISTING_COLUMN_BY_JSON_KEY,
    LISTING_OPTIONAL_FIELDS,
    Listing,
    ListingPhoto,
)
from core.schemas import (
    ExportListingOut,
    ExportListingPhotoOut,
    ListingOut,
    ListingPhotoOut,
)

CONTRACT_PATH = (
    Path(__file__).parents[2] / "ingest" / "fixtures" / "portal-listings.contract.json"
)
EXPORT = "/api/export/listings"
TOKEN = "contract-token"

FULL = {
    "species": "cat",
    "status": "available",
    "name": "Luna",
    "sex": "female",
    "breed": "mesanec",
    "birth_date": date(2026, 1, 15),
    "approximate_age_months": 8,
    "size": "small",
    "energy": "lively",
    "good_with_kids": "yes",
    "good_with_dogs": "unknown",
    "good_with_cats": "yes",
    "apartment_ok": "yes",
    "special_needs": False,
    "short_description": "Radovedna in prijazna.",
}
SPARSE = {"species": "other", "status": "adopted", "name": "Miki"}


def load_contract() -> dict:
    return json.loads(CONTRACT_PATH.read_text(encoding="utf-8"))


def bearer(token: str) -> dict:
    return {"HTTP_AUTHORIZATION": f"Bearer {token}"}


def attach_photo(
    listing: Listing, size: tuple[int, int] = (1600, 1200)
) -> ListingPhoto:
    buffer = io.BytesIO()
    Image.new("RGB", size, (10, 20, 30)).save(buffer, format="JPEG")
    photo = ListingPhoto(listing=listing, width=size[0], height=size[1], position=0)
    photo.image.save("3f2a9c1d.jpg", ContentFile(buffer.getvalue()), save=False)
    photo.save()
    return photo


@pytest.fixture
def export_token(settings):
    settings.PORTAL_EXPORT_TOKEN = TOKEN
    return TOKEN


@pytest.mark.django_db
def test_export_is_503_when_no_token_is_configured(client, settings):
    settings.PORTAL_EXPORT_TOKEN = ""

    assert client.get(EXPORT).status_code == 503
    assert client.get(EXPORT, **bearer(TOKEN)).status_code == 503


@pytest.mark.django_db
def test_export_is_401_without_or_with_a_wrong_token(client, export_token):
    assert client.get(EXPORT).status_code == 401
    assert client.get(EXPORT, **bearer("wrong")).status_code == 401
    assert client.get(EXPORT, HTTP_AUTHORIZATION=TOKEN).status_code == 401


@pytest.mark.django_db
def test_export_is_empty_without_listings(client, export_token):
    body = client.get(EXPORT, **bearer(TOKEN)).json()

    assert set(body) == {"generatedAt", "listings"}
    assert body["listings"] == []
    assert body["generatedAt"].endswith("Z")
    datetime.fromisoformat(body["generatedAt"].replace("Z", "+00:00"))


@pytest.mark.django_db
def test_a_full_listing_carries_every_contract_field(
    client, export_token, manual_shelter
):
    contract = load_contract()
    listing = Listing.objects.create(shelter=manual_shelter, **FULL)
    attach_photo(listing)

    body = client.get(EXPORT, **bearer(TOKEN)).json()

    entry = body["listings"][0]
    assert set(entry) == set(contract["requiredFields"]) | set(
        contract["optionalFields"]
    )
    assert entry["providerId"] == manual_shelter.slug
    assert entry["id"] == str(listing.id)
    assert entry["birthDate"] == "2026-01-15"
    # False is an answer, so it survives the exclude_none pass.
    assert entry["specialNeeds"] is False
    assert entry["createdAt"].endswith("Z")
    assert entry["updatedAt"].endswith("Z")


@pytest.mark.django_db
def test_a_sparse_listing_carries_the_required_fields_only(
    client, export_token, manual_shelter
):
    contract = load_contract()
    Listing.objects.create(shelter=manual_shelter, **SPARSE)

    entry = client.get(EXPORT, **bearer(TOKEN)).json()["listings"][0]

    # An unstated field is absent, never null. That maps one to one onto the
    # Animal schema's optional fields.
    assert set(entry) == set(contract["requiredFields"])
    assert entry["photos"] == []


@pytest.mark.django_db
def test_a_photo_carries_the_contract_fields_and_an_absolute_url(
    client, export_token, manual_shelter, settings
):
    contract = load_contract()
    listing = Listing.objects.create(shelter=manual_shelter, **SPARSE)
    photo = attach_photo(listing)

    entry = client.get(EXPORT, **bearer(TOKEN)).json()["listings"][0]

    assert len(entry["photos"]) == 1
    stored = entry["photos"][0]
    assert set(stored) == set(contract["photoFields"])
    assert stored == {
        "url": f"{settings.PORTAL_PUBLIC_URL}{photo.image.url}",
        "width": 1600,
        "height": 1200,
    }
    assert stored["url"].startswith("http")


@pytest.mark.django_db
def test_an_archived_listing_is_not_exported(client, export_token, manual_shelter):
    Listing.objects.create(shelter=manual_shelter, **SPARSE)
    Listing.objects.create(shelter=manual_shelter, archived_at=timezone.now(), **FULL)

    entry = client.get(EXPORT, **bearer(TOKEN)).json()["listings"]

    assert [item["name"] for item in entry] == ["Miki"]


@pytest.mark.django_db
def test_a_crawled_shelters_listing_is_not_exported(
    client, export_token, manual_shelter, other_shelter
):
    Listing.objects.create(shelter=manual_shelter, **SPARSE)
    # A shelter that went back to being crawled. The crawl provides its
    # animals again, so exporting what it once wrote here would produce the
    # same animal twice.
    Listing.objects.create(
        shelter=other_shelter, species="dog", status="available", name="Rex"
    )

    listings = client.get(EXPORT, **bearer(TOKEN)).json()["listings"]

    assert [item["name"] for item in listings] == ["Miki"]


def test_the_field_names_match_the_contract():
    contract = load_contract()

    required = {"providerId", "id", "species", "status", "name", "photos"}
    required |= {"createdAt", "updatedAt"}
    assert set(contract["requiredFields"]) == required
    assert set(contract["optionalFields"]) == {
        key for _, key in LISTING_OPTIONAL_FIELDS
    }


def test_the_response_schemas_carry_every_contract_field():
    """The other half of the check above, on the schemas rather than the table.

    django-ninja answers with the fields the response schema declares and no
    others, so a field added to the model, the migration and the fixture but
    not to these would be absent from both routes with every other test in
    this file still green.
    """
    contract = load_contract()
    fields = set(contract["requiredFields"]) | set(contract["optionalFields"])
    photo_fields = set(contract["photoFields"])

    assert set(ExportListingOut.model_fields) == fields
    assert set(ExportListingPhotoOut.model_fields) == photo_fields
    # The API shape is the export plus what only an editor needs.
    assert set(ListingOut.model_fields) == fields | {"archivedAt"}
    assert set(ListingPhotoOut.model_fields) == photo_fields | {"id"}


def test_the_vocabularies_match_the_contract():
    contract = load_contract()

    portal_enums = {}
    for json_key, column in LISTING_COLUMN_BY_JSON_KEY.items():
        choices = Listing._meta.get_field(column).choices
        if choices:
            portal_enums[json_key] = [value for value, _ in choices]

    # Both ways: the contract names no vocabulary the model does not have,
    # and the model has none the contract has not been told about.
    assert {key: set(values) for key, values in contract["enumValues"].items()} == {
        key: set(values) for key, values in portal_enums.items()
    }


def test_the_fixture_payload_only_uses_fields_the_export_emits():
    contract = load_contract()
    known = set(contract["requiredFields"]) | set(contract["optionalFields"])

    for listing in contract["export"]["listings"]:
        assert set(listing) <= known
        assert set(listing) >= set(contract["requiredFields"])
        for photo in listing["photos"]:
            assert set(photo) == set(contract["photoFields"])
        for key, values in contract["enumValues"].items():
            if key in listing:
                assert listing[key] in values
