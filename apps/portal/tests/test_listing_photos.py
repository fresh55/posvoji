"""Uploads for a manual listing.

Nothing a shelter sends is stored as it arrived. Every test here is about
what the portal writes instead.
"""

import hashlib
import io
from pathlib import Path

import pytest
from django.core.files.uploadedfile import SimpleUploadedFile
from PIL import ExifTags, Image

from core.models import Listing, ListingPhoto

from .test_listings import create, listings_url


def photos_url(slug: str, listing_id: str) -> str:
    return f"{listings_url(slug)}/{listing_id}/photos"


def image_bytes(
    fmt: str = "JPEG",
    size: tuple[int, int] = (120, 90),
    colour: tuple[int, int, int] = (200, 40, 40),
    exif: Image.Exif | None = None,
) -> bytes:
    buffer = io.BytesIO()
    image = Image.new("RGB", size, colour)
    if exif is None:
        image.save(buffer, format=fmt)
    else:
        image.save(buffer, format=fmt, exif=exif)
    return buffer.getvalue()


def gps_exif(orientation: int | None = None) -> Image.Exif:
    """EXIF carrying the position of the phone that took the photograph."""
    exif = Image.Exif()
    exif[ExifTags.Base.Make] = "Posvoji"
    exif[ExifTags.IFD.GPSInfo] = {
        ExifTags.GPS.GPSLatitudeRef: "N",
        ExifTags.GPS.GPSLatitude: (46.0, 3.0, 0.0),
        ExifTags.GPS.GPSLongitudeRef: "E",
        ExifTags.GPS.GPSLongitude: (14.0, 30.0, 0.0),
    }
    if orientation is not None:
        exif[ExifTags.Base.Orientation] = orientation
    return exif


def upload(
    client,
    slug: str,
    listing_id: str,
    content: bytes,
    filename: str = "luna.jpg",
    ctype: str = "image/jpeg",
):
    return client.post(
        photos_url(slug, listing_id),
        {"file": SimpleUploadedFile(filename, content, content_type=ctype)},
    )


@pytest.fixture
def listing(member_client, manual_shelter):
    return create(member_client, manual_shelter.slug)


@pytest.fixture
def add(member_client, manual_shelter, listing):
    def send(content: bytes, **kwargs):
        return upload(
            member_client, manual_shelter.slug, listing["id"], content, **kwargs
        )

    return send


@pytest.mark.django_db
@pytest.mark.parametrize("fmt", ["JPEG", "PNG", "WEBP"])
def test_an_accepted_format_is_stored(add, settings, fmt):
    response = add(image_bytes(fmt))

    assert response.status_code == 201, response.content
    body = response.json()
    assert set(body) == {"id", "url", "width", "height"}
    assert body["width"] == 120
    assert body["height"] == 90
    # The url the ingest pipeline fetches is absolute and names the listing.
    prefix = f"{settings.PORTAL_PUBLIC_URL}{settings.MEDIA_URL}listings/"
    assert body["url"].startswith(prefix)
    assert body["url"].endswith(".jpg")


@pytest.mark.django_db
def test_the_stored_file_is_named_after_the_bytes_written(add, media_root):
    body = add(image_bytes()).json()

    photo = ListingPhoto.objects.get()
    stored = Path(photo.image.path)
    assert stored.is_file()
    assert stored.parent == media_root / "listings" / str(photo.listing_id)
    digest = hashlib.sha256(stored.read_bytes()).hexdigest()[:16]
    assert stored.name == f"{digest}.jpg"
    assert body["url"].endswith(photo.image.name)


@pytest.mark.django_db
def test_the_same_photograph_twice_is_one_row_and_one_file(add, media_root):
    raw = image_bytes()

    first = add(raw)
    second = add(raw, filename="ponovno.jpg")

    assert first.status_code == 201
    # Nothing was created the second time, so it is not a 201, and the shelter
    # gets the photo it already has rather than a duplicate of it.
    assert second.status_code == 200
    assert second.json() == first.json()

    photo = ListingPhoto.objects.get()
    directory = media_root / "listings" / str(photo.listing_id)
    assert [path.name for path in directory.iterdir()] == [Path(photo.image.name).name]


@pytest.mark.django_db
def test_a_different_photograph_is_a_new_row(add):
    assert add(image_bytes(colour=(10, 20, 30))).status_code == 201
    assert add(image_bytes(colour=(200, 40, 40))).status_code == 201

    assert ListingPhoto.objects.count() == 2


@pytest.mark.django_db
@pytest.mark.parametrize(
    ("content", "filename", "ctype"),
    [
        (image_bytes("GIF"), "luna.gif", "image/gif"),
        (b"to ni slika", "luna.txt", "text/plain"),
        # The client's content-type is not what decides. This one lies.
        (b"to ni slika", "luna.jpg", "image/jpeg"),
    ],
    ids=["gif", "text", "text-claiming-to-be-a-jpeg"],
)
def test_an_unaccepted_upload_is_rejected(add, content, filename, ctype):
    response = add(content, filename=filename, ctype=ctype)

    assert response.status_code == 400
    assert response.json()["detail"]
    assert ListingPhoto.objects.count() == 0


@pytest.mark.django_db
def test_an_upload_over_the_cap_is_rejected(add, settings):
    over = b"\0" * (settings.PORTAL_MAX_UPLOAD_BYTES + 1)

    response = add(over)

    assert response.status_code == 413
    assert ListingPhoto.objects.count() == 0


@pytest.mark.django_db
def test_the_exif_block_and_the_gps_in_it_are_gone(add, media_root):
    raw = image_bytes(exif=gps_exif())
    # The input really does carry it, or the assertion below proves nothing.
    assert Image.open(io.BytesIO(raw)).getexif().get_ifd(ExifTags.IFD.GPSInfo)

    assert add(raw).status_code == 201

    with Image.open(ListingPhoto.objects.get().image.path) as written:
        assert len(written.getexif()) == 0
        assert "exif" not in written.info


@pytest.mark.django_db
def test_the_orientation_is_baked_in_before_it_is_dropped(add):
    # Orientation 6 means "rotate a quarter turn", so an upright copy of this
    # photograph is 90 wide by 120 high.
    raw = image_bytes(size=(120, 90), exif=gps_exif(orientation=6))

    body = add(raw).json()

    assert (body["width"], body["height"]) == (90, 120)
    photo = ListingPhoto.objects.get()
    assert (photo.width, photo.height) == (90, 120)
    with Image.open(photo.image.path) as written:
        assert written.size == (90, 120)


@pytest.mark.django_db
def test_the_longest_side_is_capped(add):
    body = add(image_bytes(size=(3000, 1500))).json()

    assert (body["width"], body["height"]) == (2048, 1024)


@pytest.mark.django_db
def test_a_small_photograph_is_not_enlarged(add):
    body = add(image_bytes(size=(80, 40))).json()

    assert (body["width"], body["height"]) == (80, 40)


@pytest.mark.django_db
def test_photos_keep_their_upload_order(add, member_client, manual_shelter):
    for colour in ((10, 10, 10), (20, 20, 20), (30, 30, 30)):
        assert add(image_bytes(colour=colour)).status_code == 201

    assert list(ListingPhoto.objects.values_list("position", flat=True)) == [0, 1, 2]
    body = member_client.get(listings_url(manual_shelter.slug)).json()[0]
    assert [photo["id"] for photo in body["photos"]] == [
        photo.pk for photo in ListingPhoto.objects.all()
    ]


@pytest.mark.django_db
def test_deleting_a_photo_removes_the_file(add, member_client, manual_shelter, listing):
    photo_id = add(image_bytes()).json()["id"]
    stored = Path(ListingPhoto.objects.get().image.path)

    url = f"{photos_url(manual_shelter.slug, listing['id'])}/{photo_id}"
    response = member_client.delete(url)

    assert response.status_code == 204
    assert ListingPhoto.objects.count() == 0
    assert not stored.exists()
    assert not Listing.objects.get().photos.exists()


@pytest.mark.django_db
def test_deleting_an_unknown_photo_is_404(member_client, manual_shelter, listing):
    url = f"{photos_url(manual_shelter.slug, listing['id'])}/999"

    assert member_client.delete(url).status_code == 404


@pytest.mark.django_db
def test_uploading_to_an_archived_listing_is_404(
    member_client, manual_shelter, listing
):
    member_client.delete(f"{listings_url(manual_shelter.slug)}/{listing['id']}")

    response = upload(member_client, manual_shelter.slug, listing["id"], image_bytes())

    assert response.status_code == 404
    assert ListingPhoto.objects.count() == 0


@pytest.mark.django_db
def test_uploading_to_another_shelters_listing_is_404(listing, rival, other_shelter):
    response = upload(rival, other_shelter.slug, listing["id"], image_bytes())

    assert response.status_code == 404
    assert ListingPhoto.objects.count() == 0
