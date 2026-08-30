"""Authentication and abuse-control helpers shared by the API routers."""

import hashlib
import ipaddress
import secrets

from django.conf import settings
from django.http import HttpRequest
from ninja.errors import HttpError
from ninja.security import APIKeyCookie, SessionAuth
from ninja.throttling import SimpleRateThrottle

from .models import Shelter, ShelterMembership

session_auth = SessionAuth()


class CsrfOnlyAuth(APIKeyCookie):
    """Require Django's CSRF proof without requiring an authenticated user.

    Ninja exempts its route wrapper from Django's middleware-level CSRF check
    and performs the equivalent check in cookie authenticators instead. Login
    endpoints still need that check even though they deliberately accept an
    anonymous caller, so this authenticator returns a constant principal after
    APIKeyCookie has validated the CSRF cookie, header and request origin.
    """

    param_name = settings.CSRF_COOKIE_NAME

    def authenticate(self, request: HttpRequest, key: str | None) -> str | None:
        return "csrf" if key else None


csrf_auth = CsrfOnlyAuth()


def _normalise_ip(value: str | None) -> str | None:
    if not value:
        return None
    try:
        return str(ipaddress.ip_address(value.strip()))
    except ValueError:
        return None


class RequestLinkRateThrottle(SimpleRateThrottle):
    """Limit magic-link mail by client IP, independently of request.auth."""

    scope = "request-link-ip"

    def __init__(self):
        super().__init__(rate=settings.PORTAL_LOGIN_LINK_RATE)

    def get_ident(self, request: HttpRequest) -> str:
        direct_peer = _normalise_ip(request.META.get("REMOTE_ADDR"))
        trusted_proxies = settings.PORTAL_TRUSTED_PROXY_COUNT
        forwarded = request.META.get("HTTP_X_FORWARDED_FOR")

        # The documented single-host nginx/Caddy deployment reaches Django
        # from loopback. Trust that one local hop by default without trusting
        # caller-supplied forwarding headers when Django is exposed directly.
        # An explicit zero disables even this narrow default.
        if (
            trusted_proxies is None
            and direct_peer is not None
            and ipaddress.ip_address(direct_peer).is_loopback
        ):
            trusted_proxies = 1

        if trusted_proxies and forwarded:
            addresses = [part.strip() for part in forwarded.split(",")]
            # Select from the trusted, rightmost end. Empty or malformed
            # chains fall back to the direct peer instead of becoming an
            # attacker-controlled cache key.
            if (
                len(addresses) >= trusted_proxies
                and all(addresses)
                and (client_ip := _normalise_ip(addresses[-trusted_proxies]))
                is not None
            ):
                return client_ip

        return direct_peer or "unknown"

    def get_cache_key(self, request: HttpRequest) -> str:
        # Hashing keeps IPv6 punctuation and any fallback identifier out of
        # cache backend key restrictions. It is not an attempt to anonymize a
        # low-entropy IP address.
        ident = hashlib.sha256(self.get_ident(request).encode()).hexdigest()
        return self.cache_format % {"scope": self.scope, "ident": ident}


request_link_throttle = RequestLinkRateThrottle()


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
