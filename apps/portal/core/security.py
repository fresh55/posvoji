"""Authentication and abuse-control helpers shared by the API routers."""

import hashlib
import ipaddress
import secrets
import time
from typing import Literal

from django.conf import settings
from django.core.cache import cache
from django.core.exceptions import ImproperlyConfigured
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


def _hashed(value: str) -> str:
    """A cache-key-safe stand-in for an identifier.

    Keeps IPv6 punctuation, an address and any fallback identifier out of the
    cache backend's key restrictions and out of the file names the file cache
    writes. It is not an attempt to anonymize a low-entropy value.
    """
    return hashlib.sha256(value.encode()).hexdigest()


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
        ident = _hashed(self.get_ident(request))
        return self.cache_format % {"scope": self.scope, "ident": ident}


request_link_throttle = RequestLinkRateThrottle()

ADDRESS_RATE_CACHE_PREFIX = "login-link-address"


class AddressSendLimit:
    """How many login links one mailbox may be sent, read once at import.

    The IP limit is a ninja throttle built at module scope, so a rate the
    deployment spelled wrong stops the process. This limit is counted by hand,
    and without the same construction its two bad values would both surface
    late and quietly: a typo as a 500 on the login endpoint at the first
    shelter to ask for a link, and a count of zero as a portal-wide login
    outage that nobody configured and that logs only at INFO.

    The rate is parsed by ninja, so both limits are written the same way in
    the environment file.
    """

    setting = "PORTAL_LOGIN_LINK_ADDRESS_RATE"

    def __init__(self, rate: str) -> None:
        try:
            parsed = SimpleRateThrottle(rate=rate)
        except ValueError as error:
            raise ImproperlyConfigured(
                f"{self.setting} is not a rate like 3/hour: {rate!r}"
            ) from error
        if not parsed.num_requests or parsed.num_requests < 1:
            raise ImproperlyConfigured(
                f"{self.setting} must allow at least one send per period, "
                f"or no shelter can ever sign in: {rate!r}"
            )
        self.num_requests: int = parsed.num_requests
        self.duration: int = parsed.duration


address_send_limit = AddressSendLimit(settings.PORTAL_LOGIN_LINK_ADDRESS_RATE)


def address_send_allowed(email: str) -> bool:
    """Whether another login link may be sent to this address now.

    The IP throttle limits one caller. This limits one mailbox, because the
    addresses the registry publishes are the ones a shelter cannot stop
    reading, and nothing else stops a caller who changes network from asking
    for the same address again.

    The counter lives in the shared cache, so it holds across worker
    processes. cache.add opens the window and cache.incr counts inside it,
    which is atomic on the backends that can be; a lost increment under a race
    lets one extra message through and never blocks a shelter.

    The window is fixed rather than sliding, unlike the IP throttle's, so the
    limit is per clock period and not per rolling one: three sends at 10:59
    and three more at 11:00 are allowed. Twice the rate inside a couple of
    seconds is still two handfuls of mail rather than a flood, and a fixed
    window is what keeps the entry's life bounded by the window it belongs to,
    so a caller hammering one address cannot hold its lockout open forever.
    """
    limit, period = address_send_limit.num_requests, address_send_limit.duration
    ident = _hashed(email.strip().lower())
    # The window is named in the key. The count then cannot outlive the window
    # it belongs to even if an entry is left behind.
    window, elapsed = divmod(time.time(), period)
    remaining = period - elapsed
    key = f"{ADDRESS_RATE_CACHE_PREFIX}_{int(window)}_{ident}"

    if cache.add(key, 1, remaining):
        return True
    try:
        count = cache.incr(key)
    except ValueError:
        # The entry went away between the two calls, so open a window again
        # rather than refuse.
        return cache.add(key, 1, remaining)
    # Backends without a native incr implement it as get plus set, and that
    # set carries the cache's default expiry rather than this window's.
    cache.touch(key, remaining)
    return count <= limit


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


def require_shelter(
    request: HttpRequest, slug: str, *, ingestion: Literal["manual", "crawled"]
) -> Shelter:
    """The shelter behind {slug}, or 404 when its animals arrive another way.

    A manual shelter writes the record here, a crawled one corrects what the
    crawl found, and each set of routes belongs to one side of that line. A
    record with two editing authorities is what this keeps from happening:
    without the gate on both sides, a manual shelter's listings reach the
    dataset and can then be overridden as if they had been crawled.

    404 rather than 403 because the routes are not a permission the shelter is
    missing, they are not there for it at all. Membership is still what is
    checked first, so someone else's shelter is 403 either way.
    """
    shelter = require_membership(request, slug)
    if shelter.is_manual != (ingestion == "manual"):
        raise HttpError(404, "not found")
    return shelter
