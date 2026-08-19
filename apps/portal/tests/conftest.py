import json
from pathlib import Path

import pytest
from django.contrib.auth import get_user_model

from core.dataset import clear_cache
from core.models import Shelter, ShelterMembership

FIXTURES = Path(__file__).parent / "fixtures"


def make_animal(animal_id: str, shelter: Shelter, **overrides) -> dict:
    animal = {
        "id": animal_id,
        "source": {
            "providerId": shelter.slug,
            "sourceUrl": f"https://example.si/{animal_id}",
            "fetchedAt": "2026-08-18T08:00:00.000Z",
            "firstSeenAt": "2026-08-01T08:00:00.000Z",
            "lastSeenAt": "2026-08-18T08:00:00.000Z",
        },
        "shelter": {"id": shelter.slug, "name": shelter.name, "city": shelter.city},
        "species": "dog",
        "status": "available",
        "name": "Bela",
        "images": [
            {
                "sourceUrl": "https://example.si/bela.jpg",
                "cachedUrl": "/media/animals/bela.jpg",
                "rights": "cache-permitted",
            }
        ],
        "attribution": "Zavetisce Testno",
    }
    animal.update(overrides)
    return animal


@pytest.fixture(autouse=True)
def fresh_dataset_cache():
    """No parsed dataset survives from one test into the next."""
    clear_cache()
    yield
    clear_cache()


@pytest.fixture
def dataset_file(settings, tmp_path):
    """Points DATASET_PATH at a writable file and returns a writer for it."""
    path = tmp_path / "animals.json"
    settings.DATASET_PATH = path

    def write(animals: list[dict]) -> Path:
        payload = {"generatedAt": "2026-08-18T08:00:00.000Z", "animals": animals}
        path.write_text(json.dumps(payload), encoding="utf-8")
        # Two writes in one test can land in the same filesystem timestamp
        # tick, which the mtime-keyed cache cannot see. Real runs rewrite the
        # file minutes apart.
        clear_cache()
        return path

    write.path = path
    return write


@pytest.fixture
def shelter(db):
    return Shelter.objects.create(slug="testno", name="Zavetisce Testno", city="Testno")


@pytest.fixture
def other_shelter(db):
    return Shelter.objects.create(slug="drugo", name="Zavetisce Drugo", city="Drugo")


@pytest.fixture
def member(db, shelter):
    user = get_user_model().objects.create_user(
        username="info@example.si",
        email="info@example.si",
        password=None,
    )
    ShelterMembership.objects.create(user=user, shelter=shelter)
    return user


@pytest.fixture
def outsider(db):
    return get_user_model().objects.create_user(
        username="nobody@example.si",
        email="nobody@example.si",
        password=None,
    )


@pytest.fixture
def member_client(client, member):
    client.force_login(member)
    return client
