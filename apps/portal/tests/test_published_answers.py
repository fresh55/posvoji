"""What the public site shows, beside what the shelter can edit.

The merged dataset carries the reviewed enrichment on top of the crawl, and
the editable facts the portal hands out are read off the crawled file, so an
answer the site already shows used to reach the portal as no answer at all.
The animals route now sends it along as `published`, display only.
"""

import json
import os
from pathlib import Path

import pytest

from core.models import AnimalOverride

from .conftest import make_animal

TOKEN = "ingest-token"

# Everything the enrichment could have given an animal the crawl said nothing
# about, in the dataset's own nesting.
ENRICHED = {
    "size": "large",
    "energy": "lively",
    "goodWith": {"kids": "yes", "dogs": "no", "cats": "unknown"},
    "apartmentOk": "no",
}

ANSWERS = {
    "size": "large",
    "energy": "lively",
    "goodWithKids": "yes",
    "goodWithDogs": "no",
    "goodWithCats": "unknown",
    "apartmentOk": "no",
}

NO_ANSWERS = dict.fromkeys(ANSWERS)


def animals_url(slug: str) -> str:
    return f"/api/shelters/{slug}/animals"


def put(client, slug, animal_id, payload):
    return client.put(
        f"{animals_url(slug)}/{animal_id}",
        data=json.dumps(payload),
        content_type="application/json",
    )


@pytest.mark.django_db
def test_the_list_says_what_the_public_site_shows(member_client, shelter, dataset_file):
    dataset_file(
        [make_animal("testno:1", shelter, **ENRICHED)],
        crawled=[make_animal("testno:1", shelter)],
    )

    item = member_client.get(animals_url(shelter.slug)).json()[0]

    assert item["published"] == ANSWERS
    # The editable facts stay the crawl's: that is what an override is made
    # against, and what clearing one gives back.
    for key in ANSWERS:
        assert item[key] is None
    assert item["overrides"] == {}


@pytest.mark.django_db
def test_an_answer_the_site_does_not_show_is_null(member_client, shelter, dataset_file):
    dataset_file([make_animal("testno:1", shelter, energy="calm")])

    item = member_client.get(animals_url(shelter.slug)).json()[0]

    assert item["published"] == {**NO_ANSWERS, "energy": "calm"}


@pytest.mark.django_db
def test_a_published_answer_never_becomes_an_override(
    member_client, client, shelter, dataset_file, settings
):
    settings.PORTAL_EXPORT_TOKEN = TOKEN
    dataset_file(
        [make_animal("testno:1", shelter, **ENRICHED)],
        crawled=[make_animal("testno:1", shelter)],
    )

    member_client.get(animals_url(shelter.slug))
    assert not AnimalOverride.objects.exists()

    # An edit of something else writes that and only that.
    body = put(member_client, shelter.slug, "testno:1", {"name": "Belka"}).json()

    assert body["overrides"] == {"name": "Belka"}
    assert body["published"] == ANSWERS
    override = AnimalOverride.objects.get()
    assert override.overridden_fields() == {"name": "Belka"}
    assert override.baseline == {"name": "Bela"}
    feed = client.get("/api/export", HTTP_AUTHORIZATION=f"Bearer {TOKEN}").json()
    assert [entry["fields"] for entry in feed["overrides"]] == [{"name": "Belka"}]


@pytest.mark.django_db
def test_a_correction_is_sent_beside_what_the_site_still_shows(
    member_client, shelter, dataset_file
):
    # The shelter has answered since the last export. The site still shows
    # the enrichment's answer until the next one, and both are reported: the
    # editor puts the shelter's own first.
    dataset_file(
        [make_animal("testno:1", shelter, **ENRICHED)],
        crawled=[make_animal("testno:1", shelter)],
    )

    body = put(member_client, shelter.slug, "testno:1", {"energy": "calm"}).json()
    listed = member_client.get(animals_url(shelter.slug)).json()[0]

    for item in (body, listed):
        assert item["energy"] == "calm"
        assert item["overrides"] == {"energy": "calm"}
        assert item["published"]["energy"] == "lively"


@pytest.mark.django_db
def test_an_animal_missing_from_the_published_dataset_has_nothing_published(
    member_client, shelter, dataset_file
):
    # The shelter is ahead of the crawl.
    dataset_file([make_animal("testno:1", shelter, **ENRICHED)])

    response = put(member_client, shelter.slug, "testno:99", {"name": "Novinec"})

    assert response.status_code == 200
    assert response.json()["published"] is None


@pytest.mark.django_db
def test_a_missing_published_dataset_is_answered_as_before(
    member_client, shelter, dataset_file
):
    dataset_file(
        [make_animal("testno:1", shelter, **ENRICHED)],
        crawled=[make_animal("testno:1", shelter, energy="calm")],
    )
    dataset_file.path.unlink()

    listed = member_client.get(animals_url(shelter.slug))
    saved = put(member_client, shelter.slug, "testno:1", {"size": "small"})

    # The list is read off the merged dataset, so it is empty, as it always
    # was without one. A save still goes through and reads the crawl.
    assert listed.status_code == 200
    assert listed.json() == []
    assert saved.status_code == 200
    body = saved.json()
    assert body["published"] is None
    assert body["energy"] == "calm"
    assert body["size"] == "small"


@pytest.mark.django_db
def test_an_answer_outside_the_vocabulary_is_no_answer(
    member_client, shelter, dataset_file
):
    dataset_file(
        [
            make_animal(
                "testno:1",
                shelter,
                size="huge",
                energy=3,
                goodWith={"kids": "maybe", "dogs": "yes"},
            )
        ],
        crawled=[make_animal("testno:1", shelter)],
    )

    response = member_client.get(animals_url(shelter.slug))

    # The animal stays on the list. Before the check, one odd value would have
    # failed its validation and left it out.
    assert response.status_code == 200
    [item] = response.json()
    assert item["published"] == {**NO_ANSWERS, "goodWithDogs": "yes"}


@pytest.mark.django_db
def test_the_published_answers_follow_a_new_file(member_client, shelter, dataset_file):
    path = dataset_file(
        [make_animal("testno:1", shelter, energy="calm")],
        crawled=[make_animal("testno:1", shelter)],
    )
    before = member_client.get(animals_url(shelter.slug)).json()[0]

    # A new export, written the way ingest writes it: without clearing the
    # parsed copy by hand. The cache is keyed by the file's modification time
    # and size, so the one moved forward is what has to show the change.
    payload = {
        "generatedAt": "2026-08-19T08:00:00.000Z",
        "animals": [make_animal("testno:1", shelter, energy="lively")],
    }
    Path(path).write_text(json.dumps(payload), encoding="utf-8")
    later = Path(path).stat().st_mtime_ns + 5_000_000_000
    os.utime(path, ns=(later, later))

    after = member_client.get(animals_url(shelter.slug)).json()[0]

    assert before["published"]["energy"] == "calm"
    assert after["published"]["energy"] == "lively"
