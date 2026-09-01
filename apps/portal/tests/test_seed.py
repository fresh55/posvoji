import pytest
from django.contrib.auth import get_user_model
from django.core.management import call_command

from core.models import Shelter, ShelterMembership

from .conftest import FIXTURES

REGISTRY = FIXTURES / "shelters.yaml"


def seed(path=REGISTRY):
    call_command("seed_shelters", "--path", str(path))


def write_policy(providers, slug: str, body: str) -> None:
    directory = providers / slug
    directory.mkdir(parents=True, exist_ok=True)
    (directory / "policy.yaml").write_text(body, encoding="utf-8")


@pytest.mark.django_db
def test_seed_creates_shelters_logins_and_memberships():
    seed()

    assert set(Shelter.objects.values_list("slug", flat=True)) == {
        "testno",
        "drugo",
        "brez-poste",
    }
    testno = Shelter.objects.get(slug="testno")
    assert testno.name == "Zavetisce Testno"
    assert testno.city == "Testno"

    user = get_user_model().objects.get(email="info@example.si")
    assert not user.has_usable_password()
    assert ShelterMembership.objects.filter(user=user, shelter=testno).exists()

    # An entry without a registry address gets a shelter but no login.
    brez = Shelter.objects.get(slug="brez-poste")
    assert brez.memberships.count() == 0


@pytest.mark.django_db
def test_seed_is_idempotent():
    seed()
    user_ids = set(get_user_model().objects.values_list("pk", flat=True))

    seed()

    assert Shelter.objects.count() == 3
    assert get_user_model().objects.count() == 2
    assert ShelterMembership.objects.count() == 2
    assert set(get_user_model().objects.values_list("pk", flat=True)) == user_ids


@pytest.mark.django_db
def test_seed_updates_a_renamed_shelter(tmp_path):
    seed()
    changed = tmp_path / "shelters.yaml"
    changed.write_text(
        "shelters:\n"
        "  - id: testno\n"
        "    name: Zavetisce Testno (novo)\n"
        "    city: Drugam\n"
        "    email: info@example.si\n",
        encoding="utf-8",
    )

    seed(changed)

    shelter = Shelter.objects.get(slug="testno")
    assert shelter.name == "Zavetisce Testno (novo)"
    assert shelter.city == "Drugam"
    assert Shelter.objects.count() == 3


@pytest.mark.django_db
def test_seed_reads_the_ingestion_mode_from_the_provider_policy(providers_dir):
    write_policy(providers_dir, "testno", "providerId: testno\ningestion: manual\n")
    write_policy(providers_dir, "drugo", "providerId: drugo\ningestion: api\n")

    seed()

    assert Shelter.objects.get(slug="testno").ingestion == "manual"
    assert Shelter.objects.get(slug="drugo").ingestion == "api"
    # No policy file, so no adapter either: the shelter stays on the default
    # rather than becoming a manual one by accident.
    assert Shelter.objects.get(slug="brez-poste").ingestion == "scrape"


@pytest.mark.django_db
def test_seed_follows_a_policy_that_changes(providers_dir):
    write_policy(providers_dir, "testno", "providerId: testno\ningestion: manual\n")
    seed()

    write_policy(providers_dir, "testno", "providerId: testno\ningestion: scrape\n")
    seed()

    assert Shelter.objects.get(slug="testno").ingestion == "scrape"


@pytest.mark.django_db
def test_seed_falls_back_when_the_policy_states_no_usable_mode(providers_dir):
    write_policy(providers_dir, "testno", "providerId: testno\ningestion: telepathy\n")
    write_policy(providers_dir, "drugo", "providerId: drugo\n")

    seed()

    assert Shelter.objects.get(slug="testno").ingestion == "scrape"
    assert Shelter.objects.get(slug="drugo").ingestion == "scrape"


@pytest.mark.django_db
def test_seed_reuses_one_login_for_two_shelters(tmp_path):
    registry = tmp_path / "shelters.yaml"
    registry.write_text(
        "shelters:\n"
        "  - id: prvo\n"
        "    name: Prvo\n"
        "    city: Mesto\n"
        "    email: skupno@example.si\n"
        "  - id: drugo\n"
        "    name: Drugo\n"
        "    city: Mesto\n"
        "    email: SKUPNO@example.si\n",
        encoding="utf-8",
    )

    seed(registry)

    assert (
        get_user_model().objects.filter(email__iexact="skupno@example.si").count() == 1
    )
    assert ShelterMembership.objects.count() == 2
