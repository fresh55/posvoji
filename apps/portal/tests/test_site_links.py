"""The Python copy of the site's address rule, against the site's answers.

Every expected value here is read from apps/web/lib/animal-path.fixture.json,
which is cut from apps/web/lib/animal-path.ts itself and committed. The web
suite asserts the file still matches that module, so the file cannot drift
from the site without reddening a test over there; this suite asserts
core/site_links.py reproduces the file, so the site cannot move without
reddening a test over here. A rule change that is made on one side only
fails in one of the two places, in the pull request that makes it.
"""

import json

import pytest
from django.conf import settings

from core.site_links import animal_path, slugify

FIXTURE = settings.REPO_ROOT / "apps" / "web" / "lib" / "animal-path.fixture.json"


def cases(section: str) -> list:
    return json.loads(FIXTURE.read_text(encoding="utf-8"))[section]


def case_id(case: dict) -> str:
    return case.get("text") or case.get("animal", {}).get("id") or "case"


@pytest.mark.parametrize("case", cases("slugify"), ids=case_id)
def test_slugify_matches_the_site(case):
    assert slugify(case["text"]) == case["slug"]


@pytest.mark.parametrize("case", cases("animalPath"), ids=case_id)
def test_animal_path_matches_the_site(case):
    """A record's address, including what the site substitutes for a gap.

    A missing name, town or shelter id never leaves an empty segment: the
    species, the country and the word for a shelter stand in, because an
    empty segment would be a different route. The identifier with a
    character outside the basic plane in it is there for the hash, which
    runs over UTF-16 code units on both sides.
    """
    assert animal_path(case["animal"]) == case["path"]


def test_the_fixture_covers_the_hard_parts():
    """The pin is only worth as much as what it exercises.

    Each of these is a case where a plausible Python implementation gives a
    different answer from the site: a combining mark, a letter that carries
    no mark to strip, a spacing mark that is a diacritic but not a combining
    one, and an identifier outside the basic multilingual plane.
    """
    words = {case["text"] for case in cases("slugify")}
    assert any("š" in word or "ž" in word for word in words), "no caron"
    assert any("ß" in word or "ł" in word for word in words), "no whole letter"
    assert any("´" in word or "·" in word for word in words), "no spacing mark"
    ids = {case["animal"]["id"] for case in cases("animalPath")}
    assert any(max(identifier, default="") > "￿" for identifier in ids), "no astral"
