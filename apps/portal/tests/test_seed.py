from io import StringIO

import pytest
from django.contrib.auth import get_user_model
from django.core.management import call_command

from core.models import MembershipSource, Shelter, ShelterMembership

from .conftest import FIXTURES

REGISTRY = FIXTURES / "shelters.yaml"
# The same three shelters, once with another address on testno and once with
# none at all. Both are what the registry looks like after it changed.
CHANGED_EMAIL = FIXTURES / "shelters-changed-email.yaml"
NO_EMAIL = FIXTURES / "shelters-no-email.yaml"


def seed(path=REGISTRY) -> str:
    """Runs the command and returns everything it printed."""
    out = StringIO()
    call_command("seed_shelters", "--path", str(path), stdout=out)
    return out.getvalue()


def add_by_hand(shelter: Shelter, email: str) -> ShelterMembership:
    """A second login for the shelter, the way /admin makes one."""
    user = get_user_model().objects.create_user(
        username=email, email=email, password=None
    )
    return ShelterMembership.objects.create(user=user, shelter=shelter)


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
    membership = ShelterMembership.objects.get(user=user, shelter=testno)
    assert membership.source == MembershipSource.REGISTRY

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


@pytest.mark.django_db
def test_seed_moves_the_login_when_the_registry_address_changes():
    seed()
    old = get_user_model().objects.get(email="info@example.si")

    output = seed(CHANGED_EMAIL)

    testno = Shelter.objects.get(slug="testno")
    assert list(testno.memberships.values_list("user__email", "source")) == [
        ("nov@example.si", MembershipSource.REGISTRY)
    ]
    # The old login row stays and loses its access with the membership:
    # request-link and verify both require one.
    assert get_user_model().objects.filter(pk=old.pk).exists()
    assert old.shelter_memberships.count() == 0
    assert "stale registry login removed: testno (info@example.si)" in output


@pytest.mark.django_db
def test_seed_leaves_a_membership_made_by_hand():
    seed()
    testno = Shelter.objects.get(slug="testno")
    by_hand = add_by_hand(testno, "vodja@example.si")

    seed(CHANGED_EMAIL)

    by_hand.refresh_from_db()
    assert by_hand.source == MembershipSource.ADMIN
    assert set(testno.memberships.values_list("user__email", flat=True)) == {
        "nov@example.si",
        "vodja@example.si",
    }


@pytest.mark.django_db
def test_seed_removes_the_login_when_the_address_leaves_the_registry():
    seed()
    testno = Shelter.objects.get(slug="testno")
    add_by_hand(testno, "vodja@example.si")

    output = seed(NO_EMAIL)

    assert list(testno.memberships.values_list("user__email", flat=True)) == [
        "vodja@example.si"
    ]
    assert "stale registry login removed: testno (info@example.si)" in output


@pytest.mark.django_db
def test_seed_keeps_the_source_of_a_membership_it_finds():
    """A registry login handed over to admin control stays under it."""
    seed()
    testno = Shelter.objects.get(slug="testno")
    ShelterMembership.objects.filter(shelter=testno).update(
        source=MembershipSource.ADMIN
    )

    seed()

    membership = ShelterMembership.objects.get(shelter=testno)
    assert membership.source == MembershipSource.ADMIN
    assert membership.user.email == "info@example.si"


@pytest.mark.django_db
def test_seed_removes_nothing_when_the_registry_has_not_changed():
    seed()

    output = seed()

    assert ShelterMembership.objects.count() == 2
    assert "stale registry login removed" not in output
    assert "0 stale registry memberships removed" in output
