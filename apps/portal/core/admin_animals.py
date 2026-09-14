"""Every animal on the site, from every shelter, on one page.

The API answers for one shelter at a time, because that is all a shelter may
see. The admin's changelists are over the database, which holds the
corrections and the manual listings but not the crawl. So the one view
nobody had was the whole of it, and reading data/dist/animals.json by hand
was the only way to get it.

This page is that view. One row per animal of the merged dataset, which is
what the site itself shows, plus the manual listings the last run has not
carried yet, marked as such. It reads and never writes: an animal is
corrected on its override, which every row links to.
"""

from dataclasses import dataclass

from django.conf import settings
from django.contrib import admin
from django.core.paginator import Paginator
from django.shortcuts import render
from django.urls import reverse

from .dataset import load_animals, thumbnail_url
from .models import AnimalOverride, IngestionMode, Listing
from .site_links import animal_path

# Enough that a shelter's animals mostly fit on one screenful, few enough
# that the page stays light with every thumbnail on it.
PER_PAGE = 60

BY_SHELTER = "zavetisce"
BY_NAME = "ime"
BY_NEWEST = "novo"
SORTS = {
    BY_SHELTER: "zavetišču",
    BY_NAME: "imenu",
    BY_NEWEST: "prvem pojavu",
}

EDITED_YES = "da"
EDITED_NO = "ne"


@dataclass(frozen=True)
class AnimalRow:
    """One animal as the page shows it.

    Flat and already resolved, so the template asks no questions: the
    dataset record and the database row it may have are both behind this.
    """

    animal_id: str
    name: str
    species: str
    shelter_slug: str
    shelter_name: str
    status: str
    sex: str
    size: str
    age: str
    first_seen: str
    thumbnail: str | None
    site_url: str
    source_url: str
    # The fields the shelter has corrected, for the marker on the row.
    edited: tuple[str, ...]
    override_url: str | None
    # A manual listing that no run has exported yet. It is on the portal and
    # not on the site, which is the one thing the row has to say.
    pending: bool

    @property
    def sort_name(self) -> str:
        return self.name.lower()


def age_label(months) -> str:
    """An age in months, as years and months.

    The dataset states months because that is what a shelter writes for a
    kitten. Past a year the number stops being readable, so it is split.
    """
    if not isinstance(months, int) or isinstance(months, bool) or months < 0:
        return ""
    years, rest = divmod(months, 12)
    if years and rest:
        return f"{years} l {rest} m"
    if years:
        return f"{years} l"
    return f"{rest} m"


def absolute(url: str | None) -> str | None:
    """A dataset URL the admin can draw.

    Cached photographs are written as site-relative paths, and this page is
    served by the portal, where that path is another service's media. The
    site's own origin is the one that answers for them.
    """
    if not url:
        return None
    if url.startswith("/"):
        return f"{settings.FRONTEND_URL.rstrip('/')}{url}"
    return url


def text(value) -> str:
    return value if isinstance(value, str) else ""


def dataset_rows(overrides: dict[tuple[str, str], AnimalOverride]) -> list[AnimalRow]:
    """A row per animal of the merged dataset.

    The merged file already carries the corrections the last run applied, so
    the values shown are the site's. The override is looked up only to say
    which fields a shelter has had a hand in, and to link to it.
    """
    rows = []
    for animal in load_animals():
        shelter = animal.get("shelter")
        animal_id = animal.get("id")
        if not isinstance(shelter, dict) or not isinstance(animal_id, str):
            continue
        slug = text(shelter.get("id"))
        source = animal.get("source")
        source = source if isinstance(source, dict) else {}
        override = overrides.get((slug, animal_id))
        rows.append(
            AnimalRow(
                animal_id=animal_id,
                name=text(animal.get("name")),
                species=text(animal.get("species")),
                shelter_slug=slug,
                shelter_name=text(shelter.get("name")) or slug,
                status=text(animal.get("status")),
                sex=text(animal.get("sex")),
                size=text(animal.get("size")),
                age=age_label(animal.get("approximateAgeMonths")),
                first_seen=text(source.get("firstSeenAt")),
                thumbnail=absolute(thumbnail_url(animal)),
                site_url=f"{settings.FRONTEND_URL.rstrip('/')}{animal_path(animal)}",
                source_url=text(source.get("sourceUrl")),
                edited=tuple(sorted(override.overridden_fields())) if override else (),
                override_url=(
                    reverse("admin:core_animaloverride_change", args=[override.pk])
                    if override
                    else None
                ),
                pending=False,
            )
        )
    return rows


def listing_rows(known_ids: set[str]) -> list[AnimalRow]:
    """The manual listings that are not in the dataset yet.

    A manual shelter writes its animals here and a run exports them, so most
    of them arrive as ordinary dataset records and are already counted. One
    written since the last run is on no page of the site, and this is the
    only place it would show up at all. Archived listings stay out, and so do
    the listings of a shelter that is no longer manual: the export carries
    neither, so "not in the export yet" would never come true for them.
    """
    rows = []
    listings = (
        Listing.objects.filter(
            archived_at=None,
            shelter__ingestion=IngestionMode.MANUAL,
        )
        .select_related("shelter")
        .prefetch_related("photos")
    )
    for listing in listings:
        animal_id = f"{listing.shelter.slug}:{listing.id}"
        if animal_id in known_ids:
            continue
        photo = next(iter(listing.photos.all()), None)
        rows.append(
            AnimalRow(
                animal_id=animal_id,
                name=listing.name,
                species=listing.species,
                shelter_slug=listing.shelter.slug,
                shelter_name=listing.shelter.name or listing.shelter.slug,
                status=listing.status,
                sex=listing.sex or "",
                size=listing.size or "",
                age=age_label(listing.approximate_age_months),
                first_seen=listing.created_at.isoformat(),
                thumbnail=photo.image.url if photo else None,
                site_url="",
                source_url="",
                edited=(),
                override_url=None,
                pending=True,
            )
        )
    return rows


def facet(rows: list[AnimalRow], value) -> list[tuple[str, str, int]]:
    """The values one column takes, with how many rows take each.

    Built off the whole set rather than the filtered one, so the counts say
    what picking a value would give and an empty choice is visibly empty.
    """
    counts: dict[str, int] = {}
    labels: dict[str, str] = {}
    for row in rows:
        key, label = value(row)
        if not key:
            continue
        counts[key] = counts.get(key, 0) + 1
        labels[key] = label
    return [
        (key, labels[key], counts[key])
        for key in sorted(counts, key=lambda key: labels[key].lower())
    ]


def matches(
    row: AnimalRow,
    shelter: str,
    species: str,
    status: str,
    edited: str,
    q: str,
) -> bool:
    if shelter and row.shelter_slug != shelter:
        return False
    if species and row.species != species:
        return False
    if status and row.status != status:
        return False
    if edited == EDITED_YES and not row.edited:
        return False
    if edited == EDITED_NO and row.edited:
        return False
    if q:
        needle = q.casefold()
        haystack = (row.name, row.animal_id, row.shelter_name, row.shelter_slug)
        if not any(needle in part.casefold() for part in haystack):
            return False
    return True


def sorted_rows(rows: list[AnimalRow], sort: str) -> list[AnimalRow]:
    """The rows in the order the page was asked for.

    The dates are ISO strings written by ingest, so they sort as text. A
    record without one sorts last whichever way the rest goes, because
    "no date" is not a date at either end of the list.
    """
    if sort == BY_NAME:
        return sorted(rows, key=lambda row: (row.sort_name, row.shelter_name.lower()))
    if sort == BY_NEWEST:
        dated = sorted(
            (row for row in rows if row.first_seen),
            key=lambda row: row.first_seen,
            reverse=True,
        )
        return dated + [row for row in rows if not row.first_seen]
    return sorted(rows, key=lambda row: (row.shelter_name.lower(), row.sort_name))


def query_without_page(request) -> str:
    """The current filters, for a pagination link to carry."""
    params = request.GET.copy()
    params.pop("stran", None)
    encoded = params.urlencode()
    return f"&{encoded}" if encoded else ""


def all_animals(request):
    overrides = {
        (override.shelter.slug, override.animal_id): override
        for override in AnimalOverride.objects.select_related("shelter")
    }
    rows = dataset_rows(overrides)
    rows += listing_rows({row.animal_id for row in rows})

    shelter = request.GET.get("zavetisce", "")
    species = request.GET.get("vrsta", "")
    status = request.GET.get("status", "")
    edited = request.GET.get("urejeno", "")
    q = request.GET.get("q", "").strip()
    sort = request.GET.get("razvrsti", BY_SHELTER)
    if sort not in SORTS:
        sort = BY_SHELTER

    found = sorted_rows(
        [row for row in rows if matches(row, shelter, species, status, edited, q)],
        sort,
    )
    page = Paginator(found, PER_PAGE).get_page(request.GET.get("stran"))

    context = {
        **admin.site.each_context(request),
        "title": "Vse živali",
        "page": page,
        "total": len(rows),
        "found": len(found),
        "pending": sum(1 for row in rows if row.pending),
        "edited_total": sum(1 for row in rows if row.edited),
        "shelters": facet(rows, lambda row: (row.shelter_slug, row.shelter_name)),
        "species_facet": facet(rows, lambda row: (row.species, row.species)),
        "statuses": facet(rows, lambda row: (row.status, row.status)),
        "selected": {
            "zavetisce": shelter,
            "vrsta": species,
            "status": status,
            "urejeno": edited,
            "q": q,
            "razvrsti": sort,
        },
        "sorts": sorted(SORTS.items()),
        "carry": query_without_page(request),
        "overrides_url": reverse("admin:core_animaloverride_changelist"),
        "dataset_path": str(settings.DATASET_PATH),
    }
    return render(request, "admin/all_animals.html", context)
