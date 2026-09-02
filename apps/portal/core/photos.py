"""Turning an upload into the one JPEG the portal is willing to store.

Nothing a shelter uploads is kept as it arrived. Every file is decoded, put
the right way up, capped, and written out again from a blank canvas. That last
step is what actually removes the metadata: Pillow writes info["exif"] back on
save, so re-encoding the same image object would keep the GPS position the
phone that took the photograph wrote into it.
"""

import hashlib
import io
from dataclasses import dataclass

from django.conf import settings
from PIL import Image, ImageOps, UnidentifiedImageError

# Decided by opening the file, never by the client's content-type.
ACCEPTED_FORMATS = frozenset({"JPEG", "PNG", "WEBP"})

# Both rejections are reached two ways, from the header and from the decoder,
# and the shelter is told the same thing whichever one caught it.
NOT_AN_ACCEPTED_FORMAT = "only JPEG, PNG and WebP files are accepted"
TOO_MANY_PIXELS = "the image has too many pixels"

MAX_EDGE = 2048
JPEG_QUALITY = 85
NAME_LENGTH = 16

# A file small enough to accept can still decode to something that fills
# memory, so the header's dimensions are checked before anything is decoded.
# The limit is above any camera the portal is likely to meet and far below
# Pillow's own bomb threshold.
MAX_PIXELS = 60_000_000

WHITE = (255, 255, 255)


class PhotoRejected(Exception):
    """The upload is not something the portal will store.

    Carries the answer the API should give, so the route does not have to
    re-derive it from the message.
    """

    def __init__(self, detail: str, status: int = 400) -> None:
        super().__init__(detail)
        self.detail = detail
        self.status = status


@dataclass(frozen=True)
class EncodedPhoto:
    """What the portal writes to storage, and what it records about it."""

    name: str
    content: bytes
    width: int
    height: int


def encode_upload(upload) -> EncodedPhoto:
    """Reads an uploaded file within the size cap and encodes it."""
    limit = settings.PORTAL_MAX_UPLOAD_BYTES
    size = getattr(upload, "size", None)
    if size is not None and size > limit:
        raise PhotoRejected(f"the file is larger than {limit} bytes", status=413)
    # Reading one byte past the limit catches an upload whose declared size is
    # missing or wrong without pulling the whole thing into memory first.
    raw = upload.read(limit + 1)
    if len(raw) > limit:
        raise PhotoRejected(f"the file is larger than {limit} bytes", status=413)
    if not raw:
        raise PhotoRejected("the file is empty")
    return encode(raw)


def encode(raw: bytes) -> EncodedPhoto:
    """One JPEG, upright, at most MAX_EDGE on its longest side, no metadata."""
    try:
        with Image.open(io.BytesIO(raw)) as opened:
            if opened.format not in ACCEPTED_FORMATS:
                raise PhotoRejected(NOT_AN_ACCEPTED_FORMAT)
            width, height = opened.size
            if width * height > MAX_PIXELS:
                raise PhotoRejected(TOO_MANY_PIXELS)
            # Bakes the orientation in before the metadata carrying it is
            # dropped, or a photograph taken sideways would stay sideways.
            oriented = ImageOps.exif_transpose(opened)
    except UnidentifiedImageError as error:
        raise PhotoRejected(NOT_AN_ACCEPTED_FORMAT) from error
    except Image.DecompressionBombError as error:
        raise PhotoRejected(TOO_MANY_PIXELS) from error

    # thumbnail only ever shrinks, so a photograph smaller than the cap is
    # left at its own size.
    oriented.thumbnail((MAX_EDGE, MAX_EDGE), Image.Resampling.LANCZOS)

    # A blank canvas, so nothing from the source's info block can be written
    # back out. White rather than black because a PNG or WebP with an alpha
    # channel has to be flattened for JPEG, and white is what a photograph on
    # a page is seen against. convert to the mode the image already has
    # returns a copy, so this one line covers both cases.
    source = oriented.convert("RGBA")
    flat = Image.new("RGB", source.size, WHITE)
    flat.paste(source, mask=source.getchannel("A"))

    buffer = io.BytesIO()
    flat.save(buffer, format="JPEG", quality=JPEG_QUALITY, progressive=True)
    content = buffer.getvalue()
    digest = hashlib.sha256(content).hexdigest()[:NAME_LENGTH]
    return EncodedPhoto(
        name=f"{digest}.jpg",
        content=content,
        width=flat.width,
        height=flat.height,
    )
