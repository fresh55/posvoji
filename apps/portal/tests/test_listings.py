"""Listings written in the portal by a shelter that publishes no catalogue."""

import json

import pytest
from django.core.files.uploadedfile import SimpleUploadedFile

from core.models import IngestionMode, Listing

from .test_csrf import csrf_headers, strict_client

LUNA = {"species": "cat", "name": "Luna"}


def listings_url(slug: str) -> str:
    return f"/api/shelters/{slug}/listings"


def post(client, slug, payload):
    return client.post(
        listings_url(slug),
        data=json.dumps(payload),
        content_type="application/json",
    )


def put(client, slug, listing_id, payload):
    return client.put(
        f"{listings_url(slug)}/{listing_id}",
        data=json.dumps(payload),
        content_type="application/json",
    )


def create(client, slug, **fields) -> dict:
    response = post(client, slug, {**LUNA, **fields})
    assert response.status_code == 201, response.content
    return response.json()


@pytest.mark.django_db
def test_listing_requires_a_session(client, manual_shelter):
    assert client.get(listings_url(manual_shelter.slug)).status_code == 401


@pytest.mark.django_db
def test_unknown_shelter_is_404(member_client):
    assert member_client.get(listings_url("ni-tega")).status_code == 404


@pytest.mark.django_db
def test_another_shelter_is_403(member_client, other_shelter):
    other_shelter.ingestion = IngestionMode.MANUAL
    other_shelter.save(update_fields=["ingestion"])

    assert member_client.get(listings_url(other_shelter.slug)).status_code == 403


@pytest.mark.django_db
def test_a_crawled_shelter_has_no_listing_routes(member_client, shelter):
    # The member is a member. The routes are still not there, because the
    # crawl is the origin of this shelter's animals and a listing would
    # duplicate one on the next run.
    slug = shelter.slug
    listing_id = "6d1c0f6a-3c0e-4a7e-9f7b-2f4a9d1e8b10"

    photos_url = f"{listings_url(slug)}/{listing_id}/photos"
    upload = SimpleUploadedFile("luna.jpg", b"x", content_type="image/jpeg")

    assert member_client.get(listings_url(slug)).status_code == 404
    assert post(member_client, slug, LUNA).status_code == 404
    assert put(member_client, slug, listing_id, LUNA).status_code == 404
    assert member_client.delete(f"{listings_url(slug)}/{listing_id}").status_code == 404
    assert member_client.post(photos_url, {"file": upload}).status_code == 404
    assert member_client.delete(f"{photos_url}/1").status_code == 404
    assert Listing.objects.count() == 0


@pytest.mark.django_db
def test_create_stores_the_whole_listing_and_the_editor(
    member_client, manual_shelter, member
):
    body = create(
        member_client,
        manual_shelter.slug,
        status="reserved",
        sex="female",
        breed="mesanec",
        birthDate="2026-01-15",
        approximateAgeMonths=8,
        size="small",
        energy="lively",
        goodWithKids="yes",
        goodWithDogs="unknown",
        goodWithCats="yes",
        apartmentOk="yes",
        specialNeeds=False,
        shortDescription="  Radovedna in prijazna.  ",
    )

    assert body["providerId"] == manual_shelter.slug
    assert body["name"] == "Luna"
    assert body["species"] == "cat"
    assert body["status"] == "reserved"
    assert body["birthDate"] == "2026-01-15"
    assert body["shortDescription"] == "Radovedna in prijazna."
    assert body["photos"] == []
    assert body["archivedAt"] is None
    assert body["createdAt"].endswith("Z")

    listing = Listing.objects.get()
    assert str(listing.id) == body["id"]
    assert listing.created_by == member
    assert listing.updated_by == member
    assert listing.special_needs is False


@pytest.mark.django_db
def test_status_defaults_to_available(member_client, manual_shelter):
    body = create(member_client, manual_shelter.slug)

    # A plain string, not an enum repr, is what the column and the export
    # carry.
    assert body["status"] == "available"
    assert type(Listing.objects.get().status) is str


@pytest.mark.django_db
def test_an_unstated_field_comes_back_as_null(member_client, manual_shelter):
    body = create(member_client, manual_shelter.slug)

    # The editor has to be able to tell a cleared field from a filled one, so
    # unlike the export this shape keeps its nulls.
    assert body["energy"] is None
    assert body["specialNeeds"] is None


@pytest.mark.django_db
def test_blank_text_is_the_same_as_not_stating_it(member_client, manual_shelter):
    body = create(member_client, manual_shelter.slug, shortDescription="   ")

    assert body["shortDescription"] is None
    assert Listing.objects.get().short_description is None


@pytest.mark.django_db
def test_put_replaces_every_editable_field(member_client, manual_shelter):
    created = create(member_client, manual_shelter.slug, energy="calm", breed="mesanec")

    response = put(
        member_client,
        manual_shelter.slug,
        created["id"],
        {"species": "dog", "name": "Rex", "status": "adopted"},
    )

    assert response.status_code == 200
    body = response.json()
    assert body["id"] == created["id"]
    assert body["name"] == "Rex"
    assert body["species"] == "dog"
    assert body["status"] == "adopted"
    # PUT is a full replace, so a field left out of the body is cleared, not
    # left alone.
    assert body["energy"] is None
    assert body["breed"] is None


@pytest.mark.django_db
def test_the_list_holds_what_was_created(member_client, manual_shelter):
    created = create(member_client, manual_shelter.slug)

    response = member_client.get(listings_url(manual_shelter.slug))

    assert response.status_code == 200
    assert [item["id"] for item in response.json()] == [created["id"]]


@pytest.mark.django_db
def test_the_list_is_ordered_by_name_regardless_of_case(member_client, manual_shelter):
    for name in ("zoran", "bela", "Ana", "Cvetka"):
        create(member_client, manual_shelter.slug, name=name)

    body = member_client.get(listings_url(manual_shelter.slug)).json()

    # Sorted on the casefolded name, so "bela" is not pushed past "Cvetka"
    # the way a plain code point sort would.
    assert [item["name"] for item in body] == ["Ana", "bela", "Cvetka", "zoran"]


@pytest.mark.django_db
def test_two_listings_with_one_name_are_ordered_by_id(member_client, manual_shelter):
    ids = sorted(create(member_client, manual_shelter.slug)["id"] for _ in range(3))

    body = member_client.get(listings_url(manual_shelter.slug)).json()

    assert [item["id"] for item in body] == ids


@pytest.mark.django_db
def test_delete_archives_and_the_listing_leaves_the_api(member_client, manual_shelter):
    created = create(member_client, manual_shelter.slug)
    url = f"{listings_url(manual_shelter.slug)}/{created['id']}"

    assert member_client.delete(url).status_code == 204

    listing = Listing.objects.get()
    assert listing.archived_at is not None
    assert member_client.get(listings_url(manual_shelter.slug)).json() == []
    assert (
        put(member_client, manual_shelter.slug, created["id"], LUNA).status_code == 404
    )


@pytest.mark.django_db
def test_delete_is_idempotent(member_client, manual_shelter):
    created = create(member_client, manual_shelter.slug)
    url = f"{listings_url(manual_shelter.slug)}/{created['id']}"

    assert member_client.delete(url).status_code == 204
    archived_at = Listing.objects.get().archived_at

    assert member_client.delete(url).status_code == 204
    # The second delete answers the same and does not restamp the first one.
    assert Listing.objects.get().archived_at == archived_at


@pytest.mark.django_db
def test_delete_of_an_unknown_listing_is_404(member_client, manual_shelter):
    url = f"{listings_url(manual_shelter.slug)}/6d1c0f6a-3c0e-4a7e-9f7b-2f4a9d1e8b10"

    assert member_client.delete(url).status_code == 404


@pytest.mark.django_db
@pytest.mark.parametrize(
    "payload",
    [
        {"species": "cat"},
        {"name": "Luna"},
        {"species": "cat", "name": "   "},
        {"species": "zmaj", "name": "Luna"},
        {"species": "cat", "name": "Luna", "status": "unknown"},
        {"species": "cat", "name": "Luna", "energy": "hyper"},
        {"species": "cat", "name": "Luna", "goodWithKids": "maybe"},
        {"species": "cat", "name": "Luna", "approximateAgeMonths": -1},
        {"species": "cat", "name": "x" * 201},
        {"species": "cat", "name": "Luna", "breed": "x" * 201},
        {"species": "cat", "name": "Luna", "shortDescription": "x" * 2001},
        {"species": "cat", "name": "Luna", "microchip": "123"},
    ],
)
def test_create_rejects_an_invalid_body(member_client, manual_shelter, payload):
    assert post(member_client, manual_shelter.slug, payload).status_code == 422
    assert Listing.objects.count() == 0


@pytest.mark.django_db
def test_create_accepts_text_at_the_api_limit(member_client, manual_shelter):
    description = "x" * 2000

    body = create(member_client, manual_shelter.slug, shortDescription=description)

    assert body["shortDescription"] == description


@pytest.mark.django_db
def test_put_rejects_an_invalid_body(member_client, manual_shelter):
    created = create(member_client, manual_shelter.slug, energy="calm")

    response = put(
        member_client,
        manual_shelter.slug,
        created["id"],
        {"species": "cat", "name": "Luna", "energy": "hyper"},
    )

    assert response.status_code == 422
    assert Listing.objects.get().energy == "calm"


@pytest.mark.django_db
def test_another_shelter_cannot_read_or_edit_this_one(
    member_client, manual_shelter, rival, other_shelter
):
    created = create(member_client, manual_shelter.slug)

    # Under its own slug the listing is not there at all.
    assert rival.get(listings_url(other_shelter.slug)).json() == []
    assert put(rival, other_shelter.slug, created["id"], LUNA).status_code == 404
    assert (
        rival.delete(f"{listings_url(other_shelter.slug)}/{created['id']}").status_code
        == 404
    )
    # Under the owner's slug it is someone else's shelter.
    assert rival.get(listings_url(manual_shelter.slug)).status_code == 403
    assert put(rival, manual_shelter.slug, created["id"], LUNA).status_code == 403

    assert Listing.objects.get().archived_at is None


@pytest.mark.django_db
def test_me_reports_the_ingestion_mode(member_client, manual_shelter):
    body = member_client.get("/api/me").json()

    assert body["shelters"][0]["ingestion"] == "manual"


@pytest.mark.django_db
def test_create_rejects_a_missing_csrf_token(member, manual_shelter):
    client = strict_client()
    client.force_login(member)

    response = post(client, manual_shelter.slug, LUNA)

    assert response.status_code == 403
    assert Listing.objects.count() == 0


@pytest.mark.django_db
def test_create_accepts_a_trusted_origin_and_token(member, manual_shelter):
    client = strict_client()
    client.force_login(member)

    response = client.post(
        listings_url(manual_shelter.slug),
        data=json.dumps(LUNA),
        content_type="application/json",
        **csrf_headers(client),
    )

    assert response.status_code == 201
    assert Listing.objects.get().name == "Luna"
