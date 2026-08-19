"""The three way comparison between baseline, crawl and shelter."""

import pytest

from core.conflicts import CAUGHT_UP, MOVED, conflicts_for
from core.models import AnimalOverride

from .conftest import make_animal


@pytest.fixture
def override(db, shelter):
    def build(**kwargs) -> AnimalOverride:
        return AnimalOverride.objects.create(
            shelter=shelter, animal_id="testno:1", **kwargs
        )

    return build


@pytest.mark.django_db
def test_no_conflict_while_the_crawl_stands_still(override, shelter):
    row = override(status="reserved", baseline={"status": "available"})
    animal = make_animal("testno:1", shelter, status="available")

    # The override and the crawl disagree, which is the whole point of an
    # override. That on its own is not a conflict.
    assert conflicts_for(row, animal) == []


@pytest.mark.django_db
def test_a_moved_source_is_a_conflict(override, shelter):
    row = override(status="reserved", baseline={"status": "available"})
    animal = make_animal("testno:1", shelter, status="adopted")

    conflicts = conflicts_for(row, animal)

    assert len(conflicts) == 1
    assert conflicts[0].field == "status"
    assert conflicts[0].kind == MOVED
    assert conflicts[0].baseline == "available"
    assert conflicts[0].crawled == "adopted"
    assert conflicts[0].override == "reserved"


@pytest.mark.django_db
def test_the_crawl_catching_up_is_its_own_kind(override, shelter):
    row = override(status="reserved", baseline={"status": "available"})
    animal = make_animal("testno:1", shelter, status="reserved")

    conflicts = conflicts_for(row, animal)

    # Nothing is wrong on the site, the override is simply redundant now.
    assert [(c.field, c.kind) for c in conflicts] == [("status", CAUGHT_UP)]


@pytest.mark.django_db
def test_only_overridden_fields_are_compared(override, shelter):
    row = override(status="reserved", baseline={"status": "available"})
    animal = make_animal("testno:1", shelter, status="available", name="Bela II")

    # The shelter never touched the name, so the crawl changing it is just
    # the crawl doing its job.
    assert conflicts_for(row, animal) == []


@pytest.mark.django_db
def test_a_field_with_no_baseline_never_conflicts(override, shelter):
    row = override(name="Belka", status="reserved", baseline={"status": "available"})
    animal = make_animal("testno:1", shelter, status="available", name="Something")

    assert conflicts_for(row, animal) == []


@pytest.mark.django_db
def test_the_crawl_starting_to_state_a_field_is_a_conflict(override, shelter):
    row = override(energy="calm", baseline={"energy": None})
    animal = make_animal("testno:1", shelter, energy="lively")

    conflicts = conflicts_for(row, animal)

    # A null baseline is a recorded reading: the crawl stated nothing then
    # and states something now, which the shelter should hear about.
    assert [(c.field, c.baseline, c.crawled) for c in conflicts] == [
        ("energy", None, "lively")
    ]


@pytest.mark.django_db
def test_the_nested_good_with_block_is_compared_flat(override, shelter):
    row = override(good_with_dogs="yes", baseline={"goodWithDogs": "no"})
    animal = make_animal("testno:1", shelter, goodWith={"dogs": "unknown"})

    assert [(c.field, c.crawled) for c in conflicts_for(row, animal)] == [
        ("goodWithDogs", "unknown")
    ]


@pytest.mark.django_db
def test_an_animal_outside_the_dataset_has_nothing_to_compare(override):
    row = override(status="reserved", baseline={"status": "available"})

    assert conflicts_for(row, None) == []


@pytest.mark.django_db
def test_several_fields_are_reported_separately(override, shelter):
    row = override(
        status="reserved",
        breed="mešanec",
        baseline={"status": "available", "breed": "kuža"},
    )
    animal = make_animal("testno:1", shelter, status="adopted", breed="mešanec")

    conflicts = {c.field: c.kind for c in conflicts_for(row, animal)}

    assert conflicts == {"status": MOVED, "breed": CAUGHT_UP}
