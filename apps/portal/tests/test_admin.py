"""The maintainer's review surface for overrides that the crawl moved under."""

import pytest
from django.contrib.admin.sites import site
from django.contrib.messages.storage.fallback import FallbackStorage

from core.admin import AnimalOverrideAdmin
from core.models import AnimalOverride

from .conftest import make_animal

CHANGELIST = "/admin/core/animaloverride/"


@pytest.fixture
def override_admin():
    return AnimalOverrideAdmin(AnimalOverride, site)


def run_action(admin, action, rf, user, queryset):
    """Calls an admin action outside a real admin POST.

    The action reports what it did with message_user, which needs the
    messages framework that a bare RequestFactory request does not carry.
    """
    request = rf.post(CHANGELIST)
    request.user = user
    request.session = {}
    request._messages = FallbackStorage(request)
    getattr(admin, action)(request, queryset)


@pytest.fixture
def conflicted(db, shelter, dataset_file):
    """One override whose source moved, alongside one that did not."""
    dataset_file(
        [
            make_animal("testno:1", shelter, status="adopted", breed="kuža"),
            make_animal("testno:2", shelter, status="available"),
        ]
    )
    moved = AnimalOverride.objects.create(
        shelter=shelter,
        animal_id="testno:1",
        status="reserved",
        breed="mešanec",
        baseline={"status": "available", "breed": "kuža"},
    )
    steady = AnimalOverride.objects.create(
        shelter=shelter,
        animal_id="testno:2",
        status="reserved",
        baseline={"status": "available"},
    )
    return moved, steady


@pytest.mark.django_db
def test_the_changelist_shows_the_crawl_state(admin_client, conflicted):
    response = admin_client.get(CHANGELIST)

    assert response.status_code == 200
    body = response.content.decode()
    assert "source moved" in body
    assert "in step" in body


@pytest.mark.django_db
def test_the_filter_narrows_to_the_review_queue(admin_client, conflicted):
    moved, steady = conflicted

    body = admin_client.get(CHANGELIST, {"crawl": "moved"}).content.decode()

    assert moved.animal_id in body
    assert steady.animal_id not in body


@pytest.mark.django_db
def test_the_filter_finds_overrides_with_no_matching_animal(
    admin_client, shelter, dataset_file
):
    dataset_file([])
    AnimalOverride.objects.create(
        shelter=shelter, animal_id="testno:gone", status="reserved"
    )

    body = admin_client.get(CHANGELIST, {"crawl": "orphan"}).content.decode()

    assert "testno:gone" in body


@pytest.mark.django_db
def test_accepting_the_crawl_clears_only_the_conflicting_field(
    override_admin, rf, admin_user, conflicted
):
    moved, _ = conflicted

    run_action(
        override_admin,
        "accept_the_crawl",
        rf,
        admin_user,
        AnimalOverride.objects.filter(pk=moved.pk),
    )

    moved.refresh_from_db()
    # status moved and is handed back; breed never moved and stays corrected.
    assert moved.status is None
    assert moved.breed == "mešanec"
    assert moved.baseline == {"breed": "kuža"}
    assert moved.updated_by == admin_user


@pytest.mark.django_db
def test_accepting_the_crawl_leaves_untouched_rows_alone(
    override_admin, rf, admin_user, conflicted
):
    _, steady = conflicted

    run_action(
        override_admin,
        "accept_the_crawl",
        rf,
        admin_user,
        AnimalOverride.objects.all(),
    )

    steady.refresh_from_db()
    assert steady.status == "reserved"
    assert steady.baseline == {"status": "available"}


@pytest.mark.django_db
def test_keeping_the_correction_re_takes_the_baseline(
    override_admin, rf, admin_user, conflicted
):
    moved, _ = conflicted

    run_action(
        override_admin,
        "keep_the_correction",
        rf,
        admin_user,
        AnimalOverride.objects.filter(pk=moved.pk),
    )

    moved.refresh_from_db()
    # What ships does not change, the conflict just stops being reported.
    assert moved.status == "reserved"
    assert moved.baseline == {"status": "adopted", "breed": "kuža"}
    assert moved.baseline_at is not None


@pytest.mark.django_db
def test_keeping_the_correction_clears_the_review_queue(
    admin_client, override_admin, rf, admin_user, conflicted
):
    moved, _ = conflicted
    run_action(
        override_admin,
        "keep_the_correction",
        rf,
        admin_user,
        AnimalOverride.objects.filter(pk=moved.pk),
    )

    body = admin_client.get(CHANGELIST, {"crawl": "moved"}).content.decode()

    assert moved.animal_id not in body
