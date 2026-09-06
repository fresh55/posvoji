import json
from pathlib import Path

import pytest
from django.conf import settings as django_settings
from django.contrib.auth import get_user_model
from django.test import Client

from core.dataset import clear_cache
from core.models import IngestionMode, Shelter, ShelterMembership

FIXTURES = Path(__file__).parent / "fixtures"


@pytest.fixture(scope="session")
def django_db_modify_db_settings(
    django_db_modify_db_settings_parallel_suffix, tmp_path_factory
):
    """The test database is a file, not pytest-django's in-memory default.

    A file is what development and production run on, so the journal and
    transaction settings in portal/settings.py apply to the tests as well. It
    is also what gives the live server's request threads connections of their
    own: on an in-memory database they all share one, and a test of parallel
    writes would prove nothing. Django deletes the file when the session
    ends, and it sits in pytest's temporary tree, never in the checkout.
    """
    # In place: Django has already filled the other TEST keys with defaults.
    test_settings = django_settings.DATABASES["default"].setdefault("TEST", {})
    test_settings["NAME"] = str(tmp_path_factory.mktemp("db") / "test.sqlite3")


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


@pytest.fixture(autouse=True)
def dataset_paths(settings, tmp_path):
    """Both dataset paths point into tmp_path, where no file exists yet.

    No test reads the repository's real data/dist, and a test that never
    writes a dataset sees a missing one, which is the state before the first
    ingest run.
    """
    settings.DATASET_PATH = tmp_path / "animals.json"
    settings.CRAWLED_DATASET_PATH = tmp_path / "animals.crawled.json"


@pytest.fixture
def dataset_file(settings):
    """A writer for the two dataset files.

    write(animals) writes the same records to both, which is what one ingest
    run leaves behind when no override applied. write(animals, crawled=...)
    writes what the crawl said separately, for a run that merged overrides.
    Deleting write.crawled_path is a data/dist from before the split.
    """
    path = Path(settings.DATASET_PATH)
    crawled_path = Path(settings.CRAWLED_DATASET_PATH)

    def write(animals: list[dict], *, crawled: list[dict] | None = None) -> Path:
        records = (
            (path, animals),
            (crawled_path, animals if crawled is None else crawled),
        )
        for target, content in records:
            payload = {"generatedAt": "2026-08-18T08:00:00.000Z", "animals": content}
            target.write_text(json.dumps(payload), encoding="utf-8")
        # Two writes in one test can land in the same filesystem timestamp
        # tick, which the mtime-keyed cache cannot see. Real runs rewrite the
        # file minutes apart.
        clear_cache()
        return path

    write.path = path
    write.crawled_path = crawled_path
    return write


@pytest.fixture(autouse=True)
def media_root(settings, tmp_path):
    """Uploaded photographs land in a temporary tree, never in the checkout."""
    settings.MEDIA_ROOT = tmp_path / "media"
    return settings.MEDIA_ROOT


@pytest.fixture(autouse=True)
def providers_dir(settings, tmp_path):
    """No test reads the repository's real provider policies."""
    path = tmp_path / "providers"
    path.mkdir()
    settings.PROVIDERS_PATH = path
    return path


@pytest.fixture
def shelter(db):
    return Shelter.objects.create(slug="testno", name="Zavetisce Testno", city="Testno")


@pytest.fixture
def manual_shelter(shelter):
    """The member's shelter, writing its own listings instead of being crawled."""
    shelter.ingestion = IngestionMode.MANUAL
    shelter.save(update_fields=["ingestion"])
    return shelter


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


@pytest.fixture
def rival(db, other_shelter):
    """A second manual shelter, signed in as its own member.

    Enough to check that one shelter cannot read or edit another's listings
    even when both of them write their own.
    """
    other_shelter.ingestion = IngestionMode.MANUAL
    other_shelter.save(update_fields=["ingestion"])
    user = get_user_model().objects.create_user(
        username="drugo@example.si",
        email="drugo@example.si",
        password=None,
    )
    ShelterMembership.objects.create(user=user, shelter=other_shelter)
    client = Client()
    client.force_login(user)
    return client
