from datetime import UTC, date, datetime

import pytest

from core.models import AnimalOverride

EXPORT = "/api/export"
TOKEN = "ingest-token"


@pytest.fixture
def export_token(settings):
    settings.PORTAL_EXPORT_TOKEN = TOKEN
    return TOKEN


def bearer(token: str) -> dict:
    return {"HTTP_AUTHORIZATION": f"Bearer {token}"}


@pytest.mark.django_db
def test_export_is_503_when_no_token_is_configured(client, settings):
    settings.PORTAL_EXPORT_TOKEN = ""

    assert client.get(EXPORT).status_code == 503
    assert client.get(EXPORT, **bearer(TOKEN)).status_code == 503


@pytest.mark.django_db
def test_export_is_401_without_a_token(client, export_token):
    assert client.get(EXPORT).status_code == 401


@pytest.mark.django_db
def test_export_is_401_for_a_wrong_token(client, export_token):
    assert client.get(EXPORT, **bearer("wrong")).status_code == 401
    assert client.get(EXPORT, HTTP_AUTHORIZATION=TOKEN).status_code == 401


@pytest.mark.django_db
def test_export_returns_only_overridden_fields(
    client, export_token, shelter, other_shelter
):
    AnimalOverride.objects.create(
        shelter=shelter,
        animal_id="testno:1",
        name="Belka",
        status="reserved",
        birth_date=date(2024, 5, 1),
        approximate_age_months=27,
    )
    AnimalOverride.objects.create(
        shelter=other_shelter,
        animal_id="drugo:7",
        short_description="Prijazen maček.",
    )
    # An empty row carries no information and stays out of the feed.
    AnimalOverride.objects.create(shelter=shelter, animal_id="testno:2")

    response = client.get(EXPORT, **bearer(TOKEN))

    assert response.status_code == 200
    body = response.json()
    assert set(body) == {"generatedAt", "overrides"}
    assert body["generatedAt"].endswith("Z")
    datetime.fromisoformat(body["generatedAt"].replace("Z", "+00:00"))
    assert body["overrides"] == [
        {
            "providerId": "drugo",
            "animalId": "drugo:7",
            "fields": {"shortDescription": "Prijazen maček."},
        },
        {
            "providerId": "testno",
            "animalId": "testno:1",
            "fields": {
                "name": "Belka",
                "status": "reserved",
                "birthDate": "2024-05-01",
                "approximateAgeMonths": 27,
            },
        },
    ]


@pytest.mark.django_db
def test_export_carries_the_good_with_answers(client, export_token, shelter):
    AnimalOverride.objects.create(
        shelter=shelter,
        animal_id="testno:1",
        good_with_kids="yes",
        good_with_cats="unknown",
    )

    body = client.get(EXPORT, **bearer(TOKEN)).json()

    # A group that was never answered stays out of the payload; "unknown" is
    # an answer and is carried.
    assert body["overrides"] == [
        {
            "providerId": "testno",
            "animalId": "testno:1",
            "fields": {"goodWithKids": "yes", "goodWithCats": "unknown"},
        }
    ]


@pytest.mark.django_db
def test_export_carries_the_energy_level(client, export_token, shelter):
    AnimalOverride.objects.create(
        shelter=shelter,
        animal_id="testno:1",
        energy="calm",
    )

    body = client.get(EXPORT, **bearer(TOKEN)).json()

    assert body["overrides"] == [
        {
            "providerId": "testno",
            "animalId": "testno:1",
            "fields": {"energy": "calm"},
        }
    ]


@pytest.mark.django_db
def test_export_carries_apartment_ok_and_special_needs(client, export_token, shelter):
    AnimalOverride.objects.create(
        shelter=shelter,
        animal_id="testno:1",
        apartment_ok="yes",
        special_needs=False,
    )

    body = client.get(EXPORT, **bearer(TOKEN)).json()

    # False is a real answer, distinct from never being set, so it has to
    # survive the export like every other overridden value.
    assert body["overrides"] == [
        {
            "providerId": "testno",
            "animalId": "testno:1",
            "fields": {"apartmentOk": "yes", "specialNeeds": False},
        }
    ]


@pytest.mark.django_db
def test_export_is_empty_without_overrides(client, export_token):
    body = client.get(EXPORT, **bearer(TOKEN)).json()

    assert body["overrides"] == []


@pytest.mark.django_db
def test_export_carries_the_baseline_and_when_it_was_taken(
    client, export_token, shelter
):
    AnimalOverride.objects.create(
        shelter=shelter,
        animal_id="testno:1",
        status="reserved",
        baseline={"status": "available"},
        baseline_at=datetime(2026, 8, 18, 9, 0, tzinfo=UTC),
    )

    body = client.get(EXPORT, **bearer(TOKEN)).json()

    assert body["overrides"] == [
        {
            "providerId": "testno",
            "animalId": "testno:1",
            "fields": {"status": "reserved"},
            "baseline": {"status": "available"},
            "recordedAt": "2026-08-18T09:00:00Z",
        }
    ]


@pytest.mark.django_db
def test_export_keeps_a_null_baseline_value(client, export_token, shelter):
    AnimalOverride.objects.create(
        shelter=shelter,
        animal_id="testno:1",
        energy="calm",
        baseline={"energy": None},
        baseline_at=datetime(2026, 8, 18, 9, 0, tzinfo=UTC),
    )

    body = client.get(EXPORT, **bearer(TOKEN)).json()

    # "the crawl stated nothing then" is a reading, not a missing key, so it
    # has to survive the response even though empty schema fields are dropped.
    assert body["overrides"][0]["baseline"] == {"energy": None}


@pytest.mark.django_db
def test_export_omits_a_baseline_for_a_field_that_is_no_longer_overridden(
    client, export_token, shelter
):
    AnimalOverride.objects.create(
        shelter=shelter,
        animal_id="testno:1",
        status="reserved",
        baseline={"status": "available", "breed": "kuža"},
        baseline_at=datetime(2026, 8, 18, 9, 0, tzinfo=UTC),
    )

    body = client.get(EXPORT, **bearer(TOKEN)).json()

    assert body["overrides"][0]["baseline"] == {"status": "available"}


@pytest.mark.django_db
def test_export_leaves_the_baseline_keys_out_when_there_is_none(
    client, export_token, shelter
):
    AnimalOverride.objects.create(
        shelter=shelter, animal_id="testno:1", status="reserved"
    )

    body = client.get(EXPORT, **bearer(TOKEN)).json()

    assert set(body["overrides"][0]) == {"providerId", "animalId", "fields"}
