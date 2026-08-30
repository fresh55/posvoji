import json
from datetime import date, datetime
from pathlib import Path

import pytest

from core.models import COLUMN_BY_JSON_KEY, OVERRIDE_FIELDS, AnimalOverride, Shelter

CONTRACT_PATH = (
    Path(__file__).parents[2] / "ingest" / "fixtures" / "portal-export.contract.json"
)
EXPORT = "/api/export"
TOKEN = "contract-token"


def load_contract() -> dict:
    return json.loads(CONTRACT_PATH.read_text(encoding="utf-8"))


def field_values(contract: dict) -> dict[str, set[object]]:
    values: dict[str, set[object]] = {}
    for override in contract["export"]["overrides"]:
        for field, value in override["fields"].items():
            values.setdefault(field, set()).add(value)
    return values


def to_model_value(column: str, value: object) -> object:
    if column == "birth_date" and isinstance(value, str):
        return date.fromisoformat(value)
    return value


@pytest.mark.django_db
def test_django_export_matches_the_typescript_contract(client, settings):
    contract = load_contract()
    samples = field_values(contract)

    portal_fields = [json_key for _, json_key in OVERRIDE_FIELDS]
    assert set(contract["fieldNames"]) == set(portal_fields)
    assert set(samples) == set(portal_fields)

    portal_enums = {}
    for column, json_key in OVERRIDE_FIELDS:
        choices = AnimalOverride._meta.get_field(column).choices
        if choices:
            portal_enums[json_key] = [value for value, _ in choices]
    assert {key: set(values) for key, values in contract["enumValues"].items()} == {
        key: set(values) for key, values in portal_enums.items()
    }
    for field, values in portal_enums.items():
        assert samples[field] == set(values)

    baseline_keys = {
        key
        for override in contract["export"]["overrides"]
        for key in override.get("baseline", {})
    }
    assert baseline_keys == set(portal_fields)

    shelters = {}
    for override in contract["export"]["overrides"]:
        provider_id = override["providerId"]
        shelter = shelters.get(provider_id)
        if shelter is None:
            shelter = Shelter.objects.create(
                slug=provider_id,
                name="Contract shelter",
            )
            shelters[provider_id] = shelter
        fields = {
            COLUMN_BY_JSON_KEY[key]: to_model_value(COLUMN_BY_JSON_KEY[key], value)
            for key, value in override["fields"].items()
        }
        recorded_at = override.get("recordedAt")
        AnimalOverride.objects.create(
            shelter=shelter,
            animal_id=override["animalId"],
            baseline=override.get("baseline", {}),
            baseline_at=(
                datetime.fromisoformat(recorded_at.replace("Z", "+00:00"))
                if recorded_at
                else None
            ),
            **fields,
        )

    settings.PORTAL_EXPORT_TOKEN = TOKEN
    response = client.get(
        EXPORT,
        HTTP_AUTHORIZATION=f"Bearer {TOKEN}",
    )

    assert response.status_code == 200
    actual = response.json()
    assert actual["generatedAt"].endswith("Z")
    datetime.fromisoformat(actual["generatedAt"].replace("Z", "+00:00"))
    actual["generatedAt"] = contract["export"]["generatedAt"]
    assert actual == contract["export"]
