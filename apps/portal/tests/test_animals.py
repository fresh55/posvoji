import json
from urllib.parse import quote

import pytest

from core.dataset import animals_for_shelter
from core.models import AnimalOverride, IngestionMode

from .conftest import make_animal


def animals_url(slug: str) -> str:
    return f"/api/shelters/{slug}/animals"


def put(client, slug, animal_id, payload):
    return client.put(
        f"{animals_url(slug)}/{animal_id}",
        data=json.dumps(payload),
        content_type="application/json",
    )


@pytest.mark.django_db
def test_listing_requires_a_session(client, shelter, dataset_file):
    dataset_file([])

    assert client.get(animals_url(shelter.slug)).status_code == 401


@pytest.mark.django_db
def test_unknown_shelter_is_404(member_client, dataset_file):
    dataset_file([])

    assert member_client.get(animals_url("ni-tega")).status_code == 404


@pytest.mark.django_db
def test_another_shelter_is_403(member_client, other_shelter, dataset_file):
    dataset_file([])

    assert member_client.get(animals_url(other_shelter.slug)).status_code == 403


@pytest.mark.django_db
def test_put_to_another_shelter_is_403(member_client, other_shelter, dataset_file):
    dataset_file([])

    response = put(member_client, other_shelter.slug, "drugo:1", {"name": "Vsiljivec"})

    assert response.status_code == 403
    assert AnimalOverride.objects.count() == 0


@pytest.mark.django_db
def test_a_manual_shelter_has_no_override_routes(
    member_client, manual_shelter, dataset_file
):
    # The member is a member, and after an ingest run this shelter's own
    # listings are in the dataset under <slug>:<uuid>. The routes are still
    # not there: the listing is the record, and an override on top of one
    # would give a single record two editing authorities. The mirror of the
    # answer a crawled shelter gets on the listing routes.
    animal_id = f"{manual_shelter.slug}:6d1c0f6a-3c0e-4a7e-9f7b-2f4a9d1e8b10"
    dataset_file([make_animal(animal_id, manual_shelter)])
    # There really is something to answer with, so the 404 below is the gate
    # and not an empty dataset.
    assert animals_for_shelter(manual_shelter.slug)

    assert member_client.get(animals_url(manual_shelter.slug)).status_code == 404
    response = put(member_client, manual_shelter.slug, animal_id, {"name": "Belka"})

    assert response.status_code == 404
    assert AnimalOverride.objects.count() == 0


@pytest.mark.django_db
@pytest.mark.parametrize(
    "mode", [IngestionMode.SCRAPE, IngestionMode.API, IngestionMode.RSS]
)
def test_every_crawled_mode_still_gets_its_overrides(
    member_client, shelter, dataset_file, mode
):
    # The gate is manual against the rest, not scrape against the rest: an
    # api or rss shelter is crawled too and corrects what the crawl found.
    shelter.ingestion = mode
    shelter.save(update_fields=["ingestion"])
    dataset_file([make_animal("testno:1", shelter)])

    assert member_client.get(animals_url(shelter.slug)).status_code == 200
    response = put(member_client, shelter.slug, "testno:1", {"name": "Belka"})

    assert response.status_code == 200
    assert AnimalOverride.objects.get().name == "Belka"


@pytest.mark.django_db
def test_another_shelters_mode_is_not_leaked(
    member_client, other_shelter, dataset_file
):
    # Membership first, then the mode. A non-member gets the same 403 either
    # way and cannot tell a manual shelter from a crawled one by the answer.
    other_shelter.ingestion = IngestionMode.MANUAL
    other_shelter.save(update_fields=["ingestion"])
    dataset_file([])

    assert member_client.get(animals_url(other_shelter.slug)).status_code == 403


@pytest.mark.django_db
def test_missing_dataset_file_returns_an_empty_list(
    member_client, shelter, settings, tmp_path
):
    settings.DATASET_PATH = tmp_path / "does-not-exist.json"

    response = member_client.get(animals_url(shelter.slug))

    assert response.status_code == 200
    assert response.json() == []


@pytest.mark.django_db
def test_listing_filters_by_shelter_and_merges_overrides(
    member_client, shelter, other_shelter, member, dataset_file
):
    dataset_file(
        [
            make_animal("testno:1", shelter, name="Bela", status="available"),
            make_animal("drugo:9", other_shelter, name="Tuja"),
        ]
    )
    AnimalOverride.objects.create(
        shelter=shelter,
        animal_id="testno:1",
        name="Belka",
        status="reserved",
        approximate_age_months=30,
        updated_by=member,
    )

    body = member_client.get(animals_url(shelter.slug)).json()

    assert len(body) == 1
    item = body[0]
    assert item["id"] == "testno:1"
    assert item["species"] == "dog"
    assert item["name"] == "Belka"
    assert item["status"] == "reserved"
    assert item["approximateAgeMonths"] == 30
    assert item["thumbnailUrl"] == "/media/animals/bela.jpg"
    assert item["overrides"] == {
        "name": "Belka",
        "status": "reserved",
        "approximateAgeMonths": 30,
    }


@pytest.mark.django_db
def test_thumbnail_falls_back_to_the_source_url(member_client, shelter, dataset_file):
    animal = make_animal("testno:2", shelter)
    animal["images"] = [
        {"sourceUrl": "https://example.si/oddaljena.jpg", "rights": "display-permitted"}
    ]
    dataset_file([animal])

    body = member_client.get(animals_url(shelter.slug)).json()

    assert body[0]["thumbnailUrl"] == "https://example.si/oddaljena.jpg"
    assert body[0]["overrides"] == {}


@pytest.mark.django_db
def test_display_only_thumbnail_never_uses_a_cached_copy(
    member_client, shelter, dataset_file
):
    animal = make_animal("testno:2", shelter)
    animal["images"] = [
        {
            "sourceUrl": "https://example.si/oddaljena.jpg",
            "cachedUrl": "/media/animals/nedovoljena-kopija.jpg",
            "rights": "display-permitted",
        }
    ]
    dataset_file([animal])

    body = member_client.get(animals_url(shelter.slug)).json()

    assert body[0]["thumbnailUrl"] == "https://example.si/oddaljena.jpg"


@pytest.mark.django_db
def test_thumbnail_skips_an_image_without_display_rights(
    member_client, shelter, dataset_file
):
    animal = make_animal("testno:2", shelter)
    animal["images"] = [
        {"sourceUrl": "https://example.si/zasebna.jpg", "rights": "unknown"},
        {
            "sourceUrl": "https://example.si/dovoljena.jpg",
            "rights": "display-permitted",
        },
    ]
    dataset_file([animal])

    body = member_client.get(animals_url(shelter.slug)).json()

    assert body[0]["thumbnailUrl"] == "https://example.si/dovoljena.jpg"


@pytest.mark.django_db
def test_thumbnail_is_absent_when_no_image_has_display_rights(
    member_client, shelter, dataset_file
):
    animal = make_animal("testno:2", shelter)
    animal["images"] = [
        {"sourceUrl": "https://example.si/zasebna.jpg", "rights": "unknown"}
    ]
    dataset_file([animal])

    body = member_client.get(animals_url(shelter.slug)).json()

    assert body[0]["thumbnailUrl"] is None


@pytest.mark.django_db
def test_put_creates_an_override_and_records_the_editor(
    member_client, shelter, member, dataset_file
):
    dataset_file([make_animal("testno:1", shelter, name="Bela")])

    response = put(
        member_client,
        shelter.slug,
        "testno:1",
        {
            "name": "Belka",
            "shortDescription": "  Mirna psicka.  ",
            "status": "hold",
            "sex": "female",
            "breed": "mesanka",
            "birthDate": "2024-05-01",
            "approximateAgeMonths": 27,
            "size": "medium",
        },
    )

    assert response.status_code == 200
    item = response.json()
    assert item["name"] == "Belka"
    assert item["shortDescription"] == "Mirna psicka."
    assert item["overrides"]["birthDate"] == "2024-05-01"

    override = AnimalOverride.objects.get(shelter=shelter, animal_id="testno:1")
    assert override.updated_by == member
    assert override.status == "hold"
    assert override.size == "medium"


@pytest.mark.django_db
def test_a_validated_vocabulary_value_stays_a_bare_string(
    member_client, shelter, dataset_file
):
    dataset_file([make_animal("testno:1", shelter)])

    body = put(
        member_client,
        shelter.slug,
        "testno:1",
        {"status": "hold", "sex": "female", "size": "medium", "energy": "calm"},
    ).json()

    # The vocabularies are the model's TextChoices, which are enum members.
    # What is stored and what goes on the wire has to be the plain value, or
    # the column, the export and the ingest contract all see an enum repr.
    assert [type(body["overrides"][key]) for key in ("status", "sex", "size")] == [
        str,
        str,
        str,
    ]
    override = AnimalOverride.objects.get(shelter=shelter, animal_id="testno:1")
    assert type(override.status) is str
    assert type(override.energy) is str
    assert override.overridden_fields() == {
        "status": "hold",
        "sex": "female",
        "size": "medium",
        "energy": "calm",
    }


@pytest.mark.django_db
def test_put_stores_the_good_with_answers(member_client, shelter, dataset_file):
    dataset_file([make_animal("testno:1", shelter)])

    response = put(
        member_client,
        shelter.slug,
        "testno:1",
        {"goodWithKids": "yes", "goodWithDogs": "no", "goodWithCats": "unknown"},
    )

    assert response.status_code == 200
    item = response.json()
    assert item["goodWithKids"] == "yes"
    assert item["goodWithDogs"] == "no"
    # "unknown" is an answer, so it is stored and reported like the others.
    assert item["goodWithCats"] == "unknown"
    assert item["overrides"] == {
        "goodWithKids": "yes",
        "goodWithDogs": "no",
        "goodWithCats": "unknown",
    }

    override = AnimalOverride.objects.get(shelter=shelter, animal_id="testno:1")
    assert override.good_with_kids == "yes"
    assert override.good_with_cats == "unknown"


@pytest.mark.django_db
def test_put_stores_the_energy_level(member_client, shelter, dataset_file):
    # The crawl left no energy on this animal, which is the usual case: the
    # portal is where most animals get one.
    dataset_file([make_animal("testno:1", shelter)])

    response = put(member_client, shelter.slug, "testno:1", {"energy": "lively"})

    assert response.status_code == 200
    item = response.json()
    assert item["energy"] == "lively"
    assert item["overrides"] == {"energy": "lively"}

    override = AnimalOverride.objects.get(shelter=shelter, animal_id="testno:1")
    assert override.energy == "lively"


@pytest.mark.django_db
def test_listing_reads_the_crawled_energy_level(member_client, shelter, dataset_file):
    dataset_file([make_animal("testno:1", shelter, energy="calm")])

    item = member_client.get(animals_url(shelter.slug)).json()[0]

    assert item["energy"] == "calm"
    assert item["overrides"] == {}


@pytest.mark.django_db
def test_listing_reads_the_crawled_apartment_ok_and_special_needs(
    member_client, shelter, dataset_file
):
    dataset_file(
        [make_animal("testno:1", shelter, apartmentOk="no", specialNeeds=True)]
    )

    item = member_client.get(animals_url(shelter.slug)).json()[0]

    assert item["apartmentOk"] == "no"
    assert item["specialNeeds"] is True
    assert item["overrides"] == {}


@pytest.mark.django_db
def test_put_rejects_an_unknown_energy_level(member_client, shelter, dataset_file):
    dataset_file([make_animal("testno:1", shelter)])

    response = put(member_client, shelter.slug, "testno:1", {"energy": "hyper"})

    assert response.status_code == 422


@pytest.mark.django_db
def test_put_stores_the_apartment_ok_answer(member_client, shelter, dataset_file):
    dataset_file([make_animal("testno:1", shelter)])

    response = put(member_client, shelter.slug, "testno:1", {"apartmentOk": "yes"})

    assert response.status_code == 200
    item = response.json()
    assert item["apartmentOk"] == "yes"
    assert item["overrides"] == {"apartmentOk": "yes"}

    override = AnimalOverride.objects.get(shelter=shelter, animal_id="testno:1")
    assert override.apartment_ok == "yes"


@pytest.mark.django_db
def test_put_rejects_an_unknown_apartment_ok_value(
    member_client, shelter, dataset_file
):
    dataset_file([make_animal("testno:1", shelter)])

    response = put(member_client, shelter.slug, "testno:1", {"apartmentOk": "maybe"})

    assert response.status_code == 422


@pytest.mark.django_db
def test_put_stores_the_special_needs_flag(member_client, shelter, dataset_file):
    dataset_file([make_animal("testno:1", shelter)])

    response = put(member_client, shelter.slug, "testno:1", {"specialNeeds": True})

    assert response.status_code == 200
    item = response.json()
    assert item["specialNeeds"] is True
    assert item["overrides"] == {"specialNeeds": True}

    override = AnimalOverride.objects.get(shelter=shelter, animal_id="testno:1")
    assert override.special_needs is True


@pytest.mark.django_db
def test_put_stores_special_needs_false_as_a_real_answer(
    member_client, shelter, dataset_file
):
    # False is a deliberate answer, not the same as never having answered, so
    # it has to survive round-tripping like every other override value.
    dataset_file([make_animal("testno:1", shelter)])

    response = put(member_client, shelter.slug, "testno:1", {"specialNeeds": False})

    assert response.status_code == 200
    assert response.json()["overrides"] == {"specialNeeds": False}


@pytest.mark.django_db
def test_listing_reads_the_crawled_good_with_block(
    member_client, shelter, dataset_file
):
    dataset_file(
        [make_animal("testno:1", shelter, goodWith={"kids": "yes", "dogs": "no"})]
    )

    item = member_client.get(animals_url(shelter.slug)).json()[0]

    assert item["goodWithKids"] == "yes"
    assert item["goodWithDogs"] == "no"
    assert item["goodWithCats"] is None
    assert item["overrides"] == {}


@pytest.mark.django_db
def test_put_rejects_an_unknown_good_with_value(member_client, shelter, dataset_file):
    dataset_file([make_animal("testno:1", shelter)])

    response = put(member_client, shelter.slug, "testno:1", {"goodWithKids": "maybe"})

    assert response.status_code == 422


@pytest.mark.django_db
def test_put_is_partial_and_null_clears_a_field(member_client, shelter, dataset_file):
    dataset_file([make_animal("testno:1", shelter, name="Bela", status="available")])
    put(member_client, shelter.slug, "testno:1", {"name": "Belka", "status": "adopted"})

    response = put(member_client, shelter.slug, "testno:1", {"name": None})

    assert response.status_code == 200
    item = response.json()
    # The crawled name is back, the untouched status override stands.
    assert item["name"] == "Bela"
    assert item["status"] == "adopted"
    assert item["overrides"] == {"status": "adopted"}

    override = AnimalOverride.objects.get(shelter=shelter, animal_id="testno:1")
    assert override.name is None
    assert override.status == "adopted"


@pytest.mark.django_db
def test_put_rejects_unknown_fields(member_client, shelter, dataset_file):
    dataset_file([make_animal("testno:1", shelter)])

    response = put(member_client, shelter.slug, "testno:1", {"microchip": "123"})

    assert response.status_code == 422
    assert AnimalOverride.objects.count() == 0


@pytest.mark.django_db
@pytest.mark.parametrize("field", ["name", "breed"])
def test_put_rejects_text_longer_than_the_model_column(
    member_client, shelter, dataset_file, field
):
    dataset_file([make_animal("testno:1", shelter)])

    response = put(member_client, shelter.slug, "testno:1", {field: "x" * 201})

    assert response.status_code == 422
    assert AnimalOverride.objects.count() == 0


@pytest.mark.django_db
def test_put_accepts_a_short_description_at_the_api_limit(
    member_client, shelter, dataset_file
):
    dataset_file([make_animal("testno:1", shelter)])
    description = "x" * 2000

    response = put(
        member_client,
        shelter.slug,
        "testno:1",
        {"shortDescription": description},
    )

    assert response.status_code == 200
    assert AnimalOverride.objects.get().short_description == description


@pytest.mark.django_db
def test_put_rejects_a_short_description_beyond_the_api_limit(
    member_client, shelter, dataset_file
):
    dataset_file([make_animal("testno:1", shelter)])

    response = put(
        member_client,
        shelter.slug,
        "testno:1",
        {"shortDescription": "x" * 2001},
    )

    assert response.status_code == 422
    assert AnimalOverride.objects.count() == 0


@pytest.mark.django_db
def test_put_accepts_an_animal_id_at_the_model_limit(
    member_client, shelter, dataset_file
):
    dataset_file([])
    animal_id = f"{shelter.slug}:{'x' * (199 - len(shelter.slug))}"
    assert len(animal_id) == 200

    response = put(member_client, shelter.slug, animal_id, {"name": "Novinec"})

    assert response.status_code == 200
    assert AnimalOverride.objects.get().animal_id == animal_id


@pytest.mark.django_db
def test_put_rejects_an_animal_id_containing_a_slash(
    member_client, shelter, dataset_file
):
    dataset_file([])
    animal_id = "testno:Žival 1/2026"
    encoded_id = quote(animal_id, safe="")

    response = put(member_client, shelter.slug, encoded_id, {"name": "Novinec"})

    assert response.status_code == 404
    assert AnimalOverride.objects.count() == 0


@pytest.mark.django_db
def test_put_rejects_an_animal_id_beyond_the_model_limit(
    member_client, shelter, dataset_file
):
    dataset_file([])
    animal_id = "x" * 201

    response = put(member_client, shelter.slug, animal_id, {"name": "Novinec"})

    assert response.status_code == 422
    assert AnimalOverride.objects.count() == 0


@pytest.mark.django_db
def test_put_rejects_an_unknown_status(member_client, shelter, dataset_file):
    dataset_file([make_animal("testno:1", shelter)])

    response = put(member_client, shelter.slug, "testno:1", {"status": "unknown"})

    assert response.status_code == 422


@pytest.mark.django_db
def test_put_works_for_an_animal_missing_from_the_dataset(
    member_client, shelter, dataset_file
):
    dataset_file([])

    response = put(member_client, shelter.slug, "testno:99", {"name": "Novinec"})

    assert response.status_code == 200
    assert response.json()["id"] == "testno:99"
    assert response.json()["species"] is None
    assert AnimalOverride.objects.filter(animal_id="testno:99").count() == 1


@pytest.mark.django_db
def test_put_twice_updates_the_same_row(member_client, shelter, dataset_file):
    dataset_file([make_animal("testno:1", shelter)])

    put(member_client, shelter.slug, "testno:1", {"name": "Prva"})
    put(member_client, shelter.slug, "testno:1", {"name": "Druga"})

    overrides = AnimalOverride.objects.filter(shelter=shelter, animal_id="testno:1")
    assert overrides.count() == 1
    assert overrides.get().name == "Druga"


@pytest.mark.django_db
def test_put_records_what_the_crawl_said_at_the_time(
    member_client, shelter, dataset_file
):
    dataset_file([make_animal("testno:1", shelter, status="available")])

    put(member_client, shelter.slug, "testno:1", {"status": "reserved"})

    override = AnimalOverride.objects.get()
    assert override.baseline == {"status": "available"}
    assert override.baseline_at is not None


@pytest.mark.django_db
def test_a_field_the_crawl_does_not_state_is_baselined_as_null(
    member_client, shelter, dataset_file
):
    dataset_file([make_animal("testno:1", shelter)])

    put(member_client, shelter.slug, "testno:1", {"energy": "calm"})

    assert AnimalOverride.objects.get().baseline == {"energy": None}


@pytest.mark.django_db
def test_the_baseline_reads_the_nested_good_with_block(
    member_client, shelter, dataset_file
):
    dataset_file([make_animal("testno:1", shelter, goodWith={"dogs": "no"})])

    put(member_client, shelter.slug, "testno:1", {"goodWithDogs": "yes"})

    assert AnimalOverride.objects.get().baseline == {"goodWithDogs": "no"}


@pytest.mark.django_db
def test_only_the_fields_in_the_body_are_baselined(
    member_client, shelter, dataset_file
):
    dataset_file([make_animal("testno:1", shelter, status="available", breed="kuža")])

    put(member_client, shelter.slug, "testno:1", {"status": "reserved"})
    put(member_client, shelter.slug, "testno:1", {"breed": "mešanec"})

    # The second call must not re-take the status baseline, or a source that
    # moved in between would stop being reported.
    assert AnimalOverride.objects.get().baseline == {
        "status": "available",
        "breed": "kuža",
    }


@pytest.mark.django_db
def test_clearing_a_field_drops_its_baseline(member_client, shelter, dataset_file):
    dataset_file([make_animal("testno:1", shelter, status="available")])

    put(member_client, shelter.slug, "testno:1", {"status": "reserved"})
    put(member_client, shelter.slug, "testno:1", {"status": None})

    override = AnimalOverride.objects.get()
    assert override.baseline == {}
    assert override.baseline_at is None


@pytest.mark.django_db
def test_re_setting_a_field_re_takes_the_baseline(member_client, shelter, dataset_file):
    dataset_file([make_animal("testno:1", shelter, status="available")])
    put(member_client, shelter.slug, "testno:1", {"status": "reserved"})

    # The crawl moves, then the shelter says it again anyway.
    dataset_file([make_animal("testno:1", shelter, status="adopted")])
    put(member_client, shelter.slug, "testno:1", {"status": "reserved"})

    assert AnimalOverride.objects.get().baseline == {"status": "adopted"}


@pytest.mark.django_db
def test_an_animal_outside_the_dataset_gets_no_baseline(
    member_client, shelter, dataset_file
):
    dataset_file([])

    response = put(member_client, shelter.slug, "testno:9", {"status": "reserved"})

    assert response.status_code == 200
    override = AnimalOverride.objects.get()
    assert override.baseline == {}
    assert override.baseline_at is None
