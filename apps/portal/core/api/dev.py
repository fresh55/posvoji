"""Development only: open a session as any shelter, with no mail round trip.

This is an authentication bypass and is treated as one. It answers 404 unless
PORTAL_DEV_LOGIN is on, and that setting is forced off whenever DEBUG is off,
so a deployment cannot switch it on by setting the variable. A portal that
does not have it enabled never advertises that these routes exist.
"""

import logging

from django.conf import settings
from django.contrib.auth import login
from ninja import Router, Status
from ninja.errors import HttpError

from ..accounts import ensure_user
from ..models import Shelter, ShelterMembership
from ..schemas import DevLoginIn, DevShelterOut, MeOut
from .auth import me_payload

logger = logging.getLogger(__name__)
router = Router()

# Reserved TLD (RFC 2606). A login minted here can never receive mail, which
# is the point: it stands in for a shelter that has no registry address.
DEV_EMAIL_DOMAIN = "dev.invalid"


def _require_enabled() -> None:
    if not settings.PORTAL_DEV_LOGIN:
        raise HttpError(404, "not found")


def dev_email(slug: str) -> str:
    return f"{slug}@{DEV_EMAIL_DOMAIN}"


def _registry_login(shelter: Shelter):
    """The shelter's real login, or None when the registry had no address."""
    membership = (
        ShelterMembership.objects.filter(shelter=shelter)
        .select_related("user")
        .order_by("pk")
        .first()
    )
    return membership.user if membership is not None else None


@router.get("/auth/dev/shelters", auth=None, response=list[DevShelterOut])
def dev_shelters(request):
    """Every shelter, with the address the picker would sign in as."""
    _require_enabled()
    rows = []
    for shelter in Shelter.objects.all():
        user = _registry_login(shelter)
        rows.append(
            {
                "slug": shelter.slug,
                "name": shelter.name,
                "city": shelter.city,
                "email": user.email if user is not None else dev_email(shelter.slug),
                "registered": user is not None,
            }
        )
    return rows


@router.post("/auth/dev/login", auth=None, response=MeOut)
def dev_login(request, payload: DevLoginIn):
    """Sign in as the shelter's own login, so the session is the real one."""
    _require_enabled()
    shelter = Shelter.objects.filter(slug=payload.slug).first()
    if shelter is None:
        raise HttpError(404, "shelter not found")

    user = _registry_login(shelter)
    if user is None:
        # A shelter the registry lists without an address still has to be
        # openable, otherwise it is the one page nobody can ever look at.
        user, _ = ensure_user(dev_email(shelter.slug))
        ShelterMembership.objects.create(user=user, shelter=shelter)

    login(request, user, backend="django.contrib.auth.backends.ModelBackend")
    logger.warning("dev login opened a session as %s", shelter.slug)
    return Status(200, me_payload(user))
