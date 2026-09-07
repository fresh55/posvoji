"""What both routers do to text on its way to a column."""

from datetime import date

from core.models import clean_text


def test_blank_text_is_none():
    assert clean_text("") is None
    assert clean_text("   ") is None
    assert clean_text("\t\n") is None


def test_surrounding_whitespace_goes():
    assert clean_text("  Bela  ") == "Bela"


def test_control_characters_are_dropped():
    assert clean_text("Bel\x00ka\x07") == "Belka"
    assert clean_text("a\x1b[31mb") == "a[31mb"
    assert clean_text("a\x7fb\x85c\x9fd") == "abcd"
    assert clean_text("\x00") is None


def test_tabs_and_line_breaks_survive_with_one_kind_of_line_end():
    assert clean_text("a\tb\r\nc\rd\ne") == "a\tb\nc\nd\ne"


def test_anything_that_is_not_text_passes_untouched():
    for value in (None, 0, 27, True, False, date(2024, 5, 1)):
        assert clean_text(value) is value
