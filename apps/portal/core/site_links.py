"""Where an animal lives on the public site.

The site is a static export. It has no route that answers "where is this
animal", and it builds its own addresses in apps/web/lib/animal-path.ts, so
the portal cannot ask for one and has to know the rule. This is that rule,
spelled a second time in Python.

Two copies of a rule drift, so neither copy is trusted on its own.
apps/web/lib/animal-path.fixture.json is cut from the TypeScript module and
committed; the web suite holds the module to the file and
tests/test_site_links.py holds this module to the same file. A change made
on one side only reddens one of the two, in the pull request that makes it,
rather than quietly pointing the admin's links at pages that do not exist.
"""

import unicodedata

from .diacritics import is_diacritic

# NFD splits c-caron into a c and a combining mark, and the mark is dropped
# with the rest of the marks. These letters carry no mark to split off, so
# they are spelled out rather than lost. Same table as animal-path.ts.
WHOLE_LETTERS = {
    "đ": "d",
    "ð": "d",
    "ł": "l",
    "ø": "o",
    "ß": "ss",
}

PREFIX = "/zival"

# An animal with no name is addressed by its species, a shelter with no town
# by the country, and a shelter whose id folds away to nothing by the word.
# An empty segment would be a different route.
UNNAMED_CITY = "slovenija"
UNNAMED_SHELTER = "zavetisce"


def slugify(text: str) -> str:
    """The address-safe form of one word, as the site writes it.

    Lowercase, decomposed, stripped of diacritics, and everything that is
    not a-z0-9 turned into a dash. The TypeScript side drops \\p{Diacritic},
    which is more than the combining marks: a spacing acute or a middle dot
    goes with them, where a combining-class test would turn each into a
    dash. diacritics.py is that property as node reads it.
    """
    decomposed = unicodedata.normalize("NFD", text.lower())
    letters = []
    for letter in decomposed:
        if is_diacritic(letter):
            continue
        if letter.isascii() and (letter.isdigit() or letter.islower()):
            letters.append(letter)
        else:
            letters.append(WHOLE_LETTERS.get(letter, "-"))
    # Collapse the runs the substitution above leaves behind, then drop the
    # dashes at either end.
    return "-".join(part for part in "".join(letters).split("-") if part)


def id_suffix(animal_id: str) -> str:
    """FNV-1a over the animal's id, kept to its top 24 bits.

    Six hex digits, short enough to read out and wide enough that a dataset
    of a few thousand animals rarely repeats one. The hash runs over UTF-16
    code units because the site's does: JavaScript's charCodeAt hands out
    one unit at a time, and a character outside the basic plane is two of
    them.
    """
    value = 0x811C9DC5
    units = animal_id.encode("utf-16-le")
    for index in range(0, len(units), 2):
        value ^= units[index] | (units[index + 1] << 8)
        value = (value * 0x01000193) & 0xFFFFFFFF
    return f"{value >> 8:06x}"


def animal_path(animal: dict) -> str:
    """The animal's own page on the site, in Slovenian.

    Takes a dataset record. The Slovenian address is the one the portal
    links to: the admin is read by the people who run the site, and the
    English one is the same page.
    """
    shelter = animal.get("shelter")
    shelter = shelter if isinstance(shelter, dict) else {}
    animal_id = animal.get("id") or ""
    name = animal.get("name")
    species = animal.get("species") or ""
    named = slugify(name) if isinstance(name, str) else ""
    city = slugify(str(shelter.get("city") or "")) or UNNAMED_CITY
    slug = slugify(str(shelter.get("id") or "")) or UNNAMED_SHELTER
    return f"{PREFIX}/{named or species}-{id_suffix(animal_id)}/{city}/{slug}"
