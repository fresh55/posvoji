"""The maintainer's view of every animal, across every shelter."""

import pytest
from django.contrib.auth import get_user_model
from django.utils import timezone

from core.models import AnimalOverride, IngestionMode, Listing, Shelter

from .conftest import make_animal

PAGE = "/admin/zivali/"


@pytest.fixture
def staff(db):
    return get_user_model().objects.create_user(
        username="vzdrzevalec",
        email="vzdrzevalec@example.si",
        password=None,
        is_staff=True,
        is_superuser=True,
    )


@pytest.fixture
def staff_client(client, staff):
    client.force_login(staff)
    return client


@pytest.fixture
def two_shelters(db, shelter, other_shelter, dataset_file):
    """One animal in each of two shelters, so a row can be told from all rows."""
    dataset_file(
        [
            make_animal("testno:1", shelter, name="Luna", species="cat"),
            make_animal("drugo:2", other_shelter, name="Dash", species="dog"),
        ]
    )
    return shelter, other_shelter


def test_anonymous_is_sent_to_the_admin_login(client, two_shelters):
    response = client.get(PAGE)
    assert response.status_code == 302
    assert "/admin/login/" in response["Location"]


def test_a_shelter_login_is_not_a_maintainer(member_client, two_shelters):
    """A shelter member has a session, and it is not one that opens this.

    The page shows every shelter's animals, which is precisely what the API
    refuses a shelter. Only staff get here.
    """
    response = member_client.get(PAGE)
    assert response.status_code == 302
    assert "/admin/login/" in response["Location"]


def test_lists_animals_of_every_shelter(staff_client, two_shelters):
    body = staff_client.get(PAGE).content.decode()
    assert "Luna" in body
    assert "Dash" in body
    assert "2 od 2 živali" in body


def test_filters_by_shelter(staff_client, two_shelters):
    body = staff_client.get(PAGE, {"zavetisce": "drugo"}).content.decode()
    assert "Dash" in body
    assert "Luna" not in body
    assert "1 od 2 živali" in body


def test_filters_by_species(staff_client, two_shelters):
    body = staff_client.get(PAGE, {"vrsta": "cat"}).content.decode()
    assert "Luna" in body
    assert "Dash" not in body


def test_searches_name_and_id(staff_client, two_shelters):
    by_name = staff_client.get(PAGE, {"q": "lun"}).content.decode()
    assert "Luna" in by_name
    assert "Dash" not in by_name

    by_id = staff_client.get(PAGE, {"q": "drugo:2"}).content.decode()
    assert "Dash" in by_id
    assert "Luna" not in by_id


def test_links_to_the_animal_on_the_site(staff_client, settings, two_shelters):
    settings.FRONTEND_URL = "https://posvoji.si"
    body = staff_client.get(PAGE, {"q": "Luna"}).content.decode()
    assert "https://posvoji.si/zival/luna-" in body


def test_marks_and_links_a_corrected_animal(staff_client, two_shelters):
    shelter, _ = two_shelters
    override = AnimalOverride.objects.create(
        shelter=shelter,
        animal_id="testno:1",
        status="reserved",
    )
    body = staff_client.get(PAGE).content.decode()
    assert "popravljeno: status" in body
    assert f"/admin/core/animaloverride/{override.pk}/change/" in body

    corrected = staff_client.get(PAGE, {"urejeno": "da"}).content.decode()
    assert "Luna" in corrected
    assert "Dash" not in corrected


@pytest.fixture
def manual_listing(db, dataset_file):
    """A manual shelter with one listing and an empty dataset.

    The dataset is what a run would have carried it into, so an empty one is
    a listing written since the last run.
    """
    shelter = Shelter.objects.create(
        slug="rocno",
        name="Zavetisce Rocno",
        city="Rocno",
        ingestion=IngestionMode.MANUAL,
    )
    dataset_file([])
    return Listing.objects.create(
        shelter=shelter,
        species="dog",
        name="Pika",
        status="available",
    )


def test_shows_a_listing_the_export_has_not_carried(staff_client, manual_listing):
    body = staff_client.get(PAGE).content.decode()
    assert "Pika" in body
    assert "ročna objava, še ni v izvozu" in body
    assert "1 ročnih objav še ni v izvozu" in body


def test_does_not_repeat_a_listing_the_dataset_already_has(
    staff_client, manual_listing, dataset_file
):
    """Once a run exports it, the dataset record is the only row.

    Ingest builds the animal id as <shelter slug>:<listing uuid>, which is
    what lets the page tell the two apart.
    """
    dataset_file(
        [
            make_animal(
                f"rocno:{manual_listing.id}",
                manual_listing.shelter,
                name="Pika",
                species="dog",
            )
        ]
    )
    body = staff_client.get(PAGE).content.decode()
    assert body.count("Pika") == 1
    assert "ročna objava" not in body


def test_leaves_out_an_archived_listing(staff_client, manual_listing):
    """Archived is out of the export and out of the site, so out of here.

    The listing changelist is where a taken-down listing is still visible.
    """
    manual_listing.archived_at = timezone.now()
    manual_listing.save(update_fields=["archived_at"])
    body = staff_client.get(PAGE).content.decode()
    assert "Pika" not in body


def test_leaves_out_a_listing_of_a_shelter_that_is_crawled_again(
    staff_client, manual_listing
):
    """The export takes listings from manual shelters only, and so does this.

    A shelter flipped back to crawled keeps its old listings in the table.
    Ingest never reads them again, so "not in the export yet" would stand
    on the page forever. Same filter as core/api/export.py.
    """
    manual_listing.shelter.ingestion = IngestionMode.SCRAPE
    manual_listing.shelter.save(update_fields=["ingestion"])
    body = staff_client.get(PAGE).content.decode()
    assert "Pika" not in body
    assert "0 od 0 živali" in body


def test_paginates(staff_client, shelter, dataset_file):
    dataset_file([make_animal(f"testno:{number}", shelter) for number in range(1, 130)])
    first = staff_client.get(PAGE).content.decode()
    assert "Stran 1 od 3" in first
    assert "129 od 129 živali" in first

    last = staff_client.get(PAGE, {"stran": 3}).content.decode()
    assert "Stran 3 od 3" in last


def test_survives_a_missing_dataset(staff_client, db):
    """No ingest run yet is an empty page, not a crash."""
    body = staff_client.get(PAGE).content.decode()
    assert "0 od 0 živali" in body
    assert "Nobena žival ne ustreza izbiri." in body
