"""Override feed for the ingest pipeline.

The key names here are a contract with apps/ingest. Do not rename them
without changing the TypeScript side in the same commit.
"""

from datetime import UTC, datetime

from django.conf import settings
from ninja import Router
from ninja.errors import HttpError

from ..models import AnimalOverride
from ..schemas import ExportOut
from ..security import export_token_auth

router = Router()


def iso_utc_now() -> str:
    return datetime.now(UTC).isoformat(timespec="seconds").replace("+00:00", "Z")


def iso_utc(value: datetime) -> str:
    return value.astimezone(UTC).isoformat(timespec="seconds").replace("+00:00", "Z")


# exclude_none keeps baseline and recordedAt off the wire entirely when a row
# has neither, rather than sending explicit nulls. It applies to the schema's
# own fields, not to the contents of the baseline dict, so a field whose
# baseline value is null still carries that null.
@router.get("/export", auth=export_token_auth, response=ExportOut, exclude_none=True)
def export_overrides(request):
    if not settings.PORTAL_EXPORT_TOKEN:
        raise HttpError(503, "export is not configured")

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
    return {"generatedAt": iso_utc_now(), "overrides": overrides}
