"""The Python copy of the site's address rule, against the site's answers.

Every expected value here was produced by apps/web/lib/animal-path.ts, not
by reading it. A change on that side that is not made in core/site_links.py
lands as a failure here.
"""

import pytest

from core.site_links import animal_path, id_suffix, slugify


@pytest.mark.parametrize(
    "text,expected",
    [
        ("Žužemberk", "zuzemberk"),
        ("  ", ""),
        ("Sv. Jurij ob Ščavnici", "sv-jurij-ob-scavnici"),
        ("ČŠŽ-123", "csz-123"),
        ("Ø Łukas ßeta đ", "o-lukas-sseta-d"),
        # Spacing marks. \p{Diacritic} covers the acute, circumflex, grave,
        # diaeresis and middle dot that sit between letters as their own
        # characters, so the site drops them; a combining-class test would
        # have dashed each one.
        ("D´Artagnan", "dartagnan"),
        ("a^b`c¨d·e", "abcde"),
        ("Rock'n'roll", "rock-n-roll"),
    ],
)
def test_slugify_matches_the_site(text, expected):
    assert slugify(text) == expected


def test_id_suffix_is_six_hex_digits():
    assert id_suffix("muri:16836") == "2f1856"
    assert id_suffix("x:1") == "870179"


def test_animal_path_matches_the_site():
    animal = {
        "id": "muri:16836",
        "name": "Luna",
        "species": "cat",
        "shelter": {"id": "muri", "name": "Zavod Muri", "city": "Ljubljana"},
    }
    assert animal_path(animal) == "/zival/luna-2f1856/ljubljana/muri"


def test_animal_path_folds_the_diacritics():
    animal = {
        "id": "macja-hisa:7",
        "name": "Črtomir Žan",
        "species": "cat",
        "shelter": {"id": "macja-hisa", "name": "Mačja hiša", "city": "Škofja Loka"},
    }
    assert animal_path(animal) == "/zival/crtomir-zan-d3005e/skofja-loka/macja-hisa"


def test_animal_path_names_what_the_record_leaves_empty():
    """A missing name, town or shelter id never leaves an empty segment.

    An empty segment is a different route, so the site substitutes the
    species, the country and the word for a shelter. This is the same record
    the TypeScript side was asked about.
    """
    animal = {"id": "x:1", "name": "", "species": "cat", "shelter": {}}
    assert animal_path(animal) == "/zival/cat-870179/slovenija/zavetisce"
