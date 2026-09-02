"""Override feed for the ingest pipeline.

The key names here are a contract with apps/ingest. Do not rename them
without changing the TypeScript side in the same commit.
"""

from datetime import UTC, datetime

from django.conf import settings
from ninja import Router
from ninja.errors import HttpError

from ..models import AnimalOverride, IngestionMode, Listing, iso_utc
from ..schemas import ExportListingsOut, ExportOut
from ..security import export_token_auth

router = Router()


def require_configured() -> None:
    """503 when the portal has no feed yet.

    Not a repeat of the authenticator's check. With no token configured the
    authenticator lets every caller through precisely so this can answer 503,
    which is what tells the pipeline there is nothing to pull.
    """
    if not settings.PORTAL_EXPORT_TOKEN:
        raise HttpError(503, "export is not configured")


# exclude_none keeps baseline and recordedAt off the wire entirely when a row
# has neither, rather than sending explicit nulls. It applies to the schema's
# own fields, not to the contents of the baseline dict, so a field whose
# baseline value is null still carries that null.
@router.get("/export", auth=export_token_auth, response=ExportOut, exclude_none=True)
def export_overrides(request):
    require_configured()

    # Stamped before the rows are read, never after. An override saved while
    # this loop runs misses the payload, and a watermark taken afterwards
    # would sit above its updated_at and tell the pipeline it was included.
    # Stamping first can only understate what is here, which is safe.
    generated_at = datetime.now(UTC)

    overrides = []
    for override in AnimalOverride.objects.select_related("shelter").all():
        fields = override.overridden_fields()
        if not fields:
            continue
        entry: dict = {
            "providerId": override.shelter.slug,
            "animalId": override.animal_id,
            "fields": fields,
        }
        # A baseline key for a field that is no longer overridden would be
        # noise on the wire, and the ingest side rejects it.
        baseline = {
            key: value
            for key, value in (override.baseline or {}).items()
            if key in fields
        }
        if baseline:
            entry["baseline"] = baseline
            if override.baseline_at is not None:
                entry["recordedAt"] = iso_utc(override.baseline_at)
        overrides.append(entry)
    return {"generatedAt": iso_utc(generated_at), "overrides": overrides}


# exclude_none is what keeps an unstated field off the wire entirely. The
# contract says every optional field is present when set and absent when not,
# never null, because that maps one to one onto the Animal schema.
@router.get(
    "/export/listings",
    auth=export_token_auth,
    response=ExportListingsOut,
    exclude_none=True,
)
def export_listings(request):
    require_configured()

    # Stamped before the rows are read for the same reason as above: a
    # listing saved while this runs misses the payload, and a watermark taken
    # afterwards would tell the pipeline it was included.
    generated_at = datetime.now(UTC)

    # Only a manual shelter's listings. A shelter switched back to a crawled
    # mode stops exporting the ones it wrote, because the crawl provides its
    # animals again and both sources would produce the same animal twice. The
    # ingest side skips a non-manual provider as well, as a second line.
    listings = (
        Listing.objects.filter(
            archived_at__isnull=True,
            shelter__ingestion=IngestionMode.MANUAL,
        )
        .select_related("shelter")
        .prefetch_related("photos")
    )
    return {
        "generatedAt": iso_utc(generated_at),
        "listings": [listing.payload() for listing in listings],
    }
