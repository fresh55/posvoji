"""Listings a manual shelter writes here instead of publishing a catalogue.

These routes exist only for a shelter whose providers/<slug>/policy.yaml says
`ingestion: manual`. For any other shelter the crawl is the origin of the
record and a listing would duplicate the animal on the next run, so the routes
answer 404 rather than 403: they are not a permission the shelter is missing,
they are not there at all.
"""

from typing import Annotated, Any
from uuid import UUID

from django.core.files.base import ContentFile
from django.db import transaction
from django.db.models import Max
from django.http import HttpRequest
from django.utils import timezone
from ninja import File, Router, Status
from ninja.errors import HttpError
from ninja.files import UploadedFile

from ..models import (
    LISTING_COLUMN_BY_JSON_KEY,
    Listing,
    ListingPhoto,
    Shelter,
    iso_utc,
    listing_photo_name,
)
from ..photos import PhotoRejected, encode_upload
from ..schemas import ListingIn, ListingOut, ListingPhotoOut
from ..security import require_membership

router = Router()


def _clean(value: Any) -> Any:
    """Blank text is the shelter not stating the field, same as an absent one."""
    if isinstance(value, str):
        return value.strip() or None
    return value


def _manual_shelter(request: HttpRequest, slug: str) -> Shelter:
    """The shelter behind {slug}, or 404 unless it writes its own listings."""
    shelter = require_membership(request, slug)
    if not shelter.is_manual:
        raise HttpError(404, "not found")
    return shelter


def _live(shelter: Shelter, listing_id: UUID) -> Listing:
    """This shelter's unarchived listing, or 404.

    An archived listing is the shelter's delete. It stays in the table so its
    uuid is never handed out again, and it is gone as far as the API goes.
    """
    listing = Listing.objects.filter(
        shelter=shelter, id=listing_id, archived_at__isnull=True
    ).first()
    if listing is None:
        raise HttpError(404, "listing not found")
    return listing


def photo_out(photo: ListingPhoto) -> dict[str, Any]:
    return {"id": photo.pk, **photo.payload()}


def listing_out(listing: Listing) -> dict[str, Any]:
    data = listing.payload()
    data["photos"] = [photo_out(photo) for photo in listing.photos.all()]
    data["archivedAt"] = (
        iso_utc(listing.archived_at) if listing.archived_at is not None else None
    )
    return data


def apply_payload(listing: Listing, payload: ListingIn) -> None:
    """Writes the whole editable surface, because PUT is a full replace."""
    values = payload.model_dump()
    for key, column in LISTING_COLUMN_BY_JSON_KEY.items():
        setattr(listing, column, _clean(values[key]))


@router.get("/shelters/{slug}/listings", response=list[ListingOut])
def list_listings(request, slug: str):
    shelter = _manual_shelter(request, slug)
    listings = (
        Listing.objects.filter(shelter=shelter, archived_at__isnull=True)
        .select_related("shelter")
        .prefetch_related("photos")
    )
    items = [listing_out(listing) for listing in listings]
    # Sorted here rather than in the database so that the order does not
    # depend on the backend's collation, the same as the animal listing.
    items.sort(key=lambda item: (item["name"].casefold(), item["id"]))
    return items


@router.post("/shelters/{slug}/listings", response={201: ListingOut})
def create_listing(request, slug: str, payload: ListingIn):
    shelter = _manual_shelter(request, slug)
    listing = Listing(
        shelter=shelter,
        created_by=request.user,
        updated_by=request.user,
    )
    apply_payload(listing, payload)
    listing.save()
    return Status(201, listing_out(listing))


@router.put("/shelters/{slug}/listings/{listing_id}", response=ListingOut)
def replace_listing(request, slug: str, listing_id: UUID, payload: ListingIn):
    shelter = _manual_shelter(request, slug)
    listing = _live(shelter, listing_id)
    apply_payload(listing, payload)
    listing.updated_by = request.user
    listing.save()
    return listing_out(listing)


@router.delete("/shelters/{slug}/listings/{listing_id}", response={204: None})
def archive_listing(request, slug: str, listing_id: UUID):
    shelter = _manual_shelter(request, slug)
    listing = Listing.objects.filter(shelter=shelter, id=listing_id).first()
    if listing is None:
        raise HttpError(404, "listing not found")
    # Archiving twice is the same answer as archiving once. The shelter asked
    # for the listing to be gone and it is.
    if listing.archived_at is None:
        listing.archived_at = timezone.now()
        listing.updated_by = request.user
        listing.save()
    return Status(204, None)


@router.post(
    "/shelters/{slug}/listings/{listing_id}/photos",
    response={200: ListingPhotoOut, 201: ListingPhotoOut},
)
def add_photo(
    request,
    slug: str,
    listing_id: UUID,
    file: Annotated[UploadedFile, File(...)],
):
    shelter = _manual_shelter(request, slug)
    listing = _live(shelter, listing_id)
    try:
        encoded = encode_upload(file)
    except PhotoRejected as rejected:
        raise HttpError(rejected.status, rejected.detail) from rejected

    # The hash is of the bytes the portal would write, and encoding never
    # touched storage, so the same photograph sent twice is recognised before
    # a second copy of it reaches the disk. 200 rather than 201 because
    # nothing was created.
    stored_name = listing_photo_name(listing.id, encoded.name)
    already = ListingPhoto.objects.filter(listing=listing, image=stored_name).first()
    if already is not None:
        return Status(200, photo_out(already))

    with transaction.atomic():
        # Serialize the read-modify-write of the position. Two uploads that
        # read the same highest position would then collide on the unique
        # constraint instead of queueing behind each other.
        Listing.objects.select_for_update().filter(pk=listing.pk).first()
        highest = ListingPhoto.objects.filter(listing=listing).aggregate(
            highest=Max("position")
        )["highest"]
        photo = ListingPhoto(
            listing=listing,
            width=encoded.width,
            height=encoded.height,
            position=0 if highest is None else highest + 1,
        )
        # Writes the file and records its name without a second database
        # write, so the row and the file land together.
        photo.image.save(encoded.name, ContentFile(encoded.content), save=False)
        photo.save()
    return Status(201, photo_out(photo))


@router.delete(
    "/shelters/{slug}/listings/{listing_id}/photos/{photo_id}",
    response={204: None},
)
def remove_photo(request, slug: str, listing_id: UUID, photo_id: int):
    shelter = _manual_shelter(request, slug)
    listing = _live(shelter, listing_id)
    photo = ListingPhoto.objects.filter(listing=listing, pk=photo_id).first()
    if photo is None:
        raise HttpError(404, "photo not found")
    # The stored copy goes with the row. Storage gives a second upload of the
    # same bytes a name of its own, so no other row points at this file.
    photo.image.delete(save=False)
    photo.delete()
    return Status(204, None)
