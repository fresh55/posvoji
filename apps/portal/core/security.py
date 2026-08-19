"""Authentication helpers shared by the API routers."""

import secrets

from django.conf import settings
from django.http import HttpRequest
from ninja.errors import HttpError

from .models import Shelter, ShelterMembership


def session_auth(request: HttpRequest):
    """Session cookie auth. Returning None makes django-ninja answer 401."""
    user = getattr(request, "user", None)
    if user is not None and user.is_authenticated:
        return user
    return None


def export_token_auth(request: HttpRequest):
    """Bearer token auth for the ingest pipeline.

    With no token configured every caller is let through so the view can
    answer 503 instead of 401; a configured token is compared in constant
    time. The principal is only ever read as "authenticated", never compared.
    """
    configured = settings.PORTAL_EXPORT_TOKEN
    if not configured:
        return "unconfigured"

    scheme, _, token = request.headers.get("Authorization", "").partition(" ")
    if scheme.lower() != "bearer" or not token:
        return None
    if not secrets.compare_digest(token, configured):
        return None
    return "ingest"


def require_membership(request: HttpRequest, slug: str) -> Shelter:
    """The shelter behind {slug}, or 404 unknown / 403 not a member."""
    shelter = Shelter.objects.filter(slug=slug).first()
    if shelter is None:
        raise HttpError(404, "shelter not found")
    is_member = ShelterMembership.objects.filter(
        user=request.user, shelter=shelter
    ).exists()
    if not is_member:
        raise HttpError(403, "not a member of this shelter")
    return shelter
