"""The strict control character rule, the one an identifier or a path takes.

clean_text keeps tab and the line ends because a description may hold them.
An animal id and a login return path may not hold any control character at
all, and both ask has_control_character rather than spelling the ranges again.
"""

import pytest

from core.models import has_control_character


@pytest.mark.parametrize(
    "value",
    [
        "\x00",  # NUL, which has reached the public dataset before
        "\x01",
        "\x1f",  # the top of the C0 range
        "\x7f",  # DEL
        "\x80",  # the C1 range, which a scan stopping at DEL lets through
        "\x85",
        "\x9f",
        "\t",  # kept by clean_text, refused here
        "\n",
        "\r",
        "zonzani:12\x003",
    ],
)
def test_every_control_character_counts(value):
    assert has_control_character(value) is True


@pytest.mark.parametrize(
    "value",
    [
        "",
        "zonzani:123",
        "/portal/zival?id=zonzani:123",
        "Bela",
        "\u010crni",  # ordinary text outside ASCII
        " ",
        # Whitespace outside ASCII is not a control character. return_path
        # refuses it on a rule of its own, which is why the two stay apart.
        "\u00a0",
        "\u2028",
    ],
)
def test_ordinary_text_does_not(value):
    assert has_control_character(value) is False
