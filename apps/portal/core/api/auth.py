"""Passwordless login.

A shelter asks for a link, django-sesame signs a token that is valid for a
day, and posting that token back opens a normal Django session.
"""

import logging
from email.utils import formataddr
from urllib.parse import urlencode

from django.conf import settings
from django.contrib.auth import get_user_model, login
from django.contrib.auth import logout as django_logout
from django.core.mail import EmailMessage
from django.http import HttpResponse
from django.middleware.csrf import get_token as get_csrf_token
from django.utils.cache import add_never_cache_headers
from ninja import Router, Status
from sesame.utils import get_token as get_login_token
from sesame.utils import get_user

from ..models import Shelter, has_control_character
from ..schemas import CsrfOut, ErrorOut, MeOut, RequestLinkIn, VerifyIn
from ..security import address_send_allowed, csrf_auth, request_link_throttle

logger = logging.getLogger(__name__)
router = Router()

# Markers an operator greps the journal for. The endpoint answers 204 either
# way, so the log is the only place a failed or suppressed send is visible.
# docs/DEPLOY-PORTAL.md has the alert recipe.
DELIVERY_FAILED = "portal.mail.delivery_failed"
ADDRESS_THROTTLED = "portal.mail.address_throttled"

EMAIL_SUBJECT = "Prijava v portal Posvoji.si"
# A mail that asks somebody to click a link has to say who is asking, what
# for, and what it will never ask of them. Diacritics included: a shelter
# reads this next to real phishing.
EMAIL_BODY = (
    "Pozdravljeni,\n"
    "\n"
    "za naslov {email} je bila zahtevana prijava v portal Posvoji.si, kjer\n"
    "zavetišča urejajo svoje objave živali na posvoji.si. Če ste bili to vi,\n"
    "odprite to povezavo:\n"
    "\n"
    "{url}\n"
    "\n"
    "Povezava velja 24 ur in deluje samo enkrat. Odprite jo v brskalniku, ki\n"
    "ga običajno uporabljate, ker prijava ostane v njem.\n"
    "\n"
    "Prava povezava vodi samo na posvoji.si. Gesla nikoli ne zahtevamo.\n"
    "\n"
    "Če prijave niste zahtevali, sporočilo prezrite. Brez te povezave se\n"
    "nihče ne more prijaviti.\n"
    "\n"
    "Posvoji.si\n"
    "Vprašanja: {reply_to}\n"
)


def me_payload(user) -> dict:
    shelters = Shelter.objects.filter(memberships__user=user).order_by("name")
    return {
        "email": user.email,
        "shelters": [
            {
                "slug": s.slug,
                "name": s.name,
                "city": s.city,
                # Which editor the workspace opens for this shelter.
                "ingestion": s.ingestion,
            }
            for s in shelters
        ],
    }


# The portal's root, where a login lands when the link says nothing else.
PORTAL_PATH = "/portal"

# Longer than any address the portal writes. Not a schema constraint, so an
# over-long value is dropped rather than refused.
MAX_RETURN_PATH_LENGTH = 500


def return_path(candidate: str | None) -> str | None:
    """The portal page a login may send the shelter back to, or None.

    The same rule as isPortalReturnPath in the web app: a path under /portal,
    which rules out an absolute and a protocol-relative URL, with nothing in
    it that could break out of the query, and not the login page itself. What
    fails the rule is dropped without a word: the value has no bearing on
    whether the mail goes out.
    """
    if not candidate or len(candidate) > MAX_RETURN_PATH_LENGTH:
        return None
    if not candidate.startswith(PORTAL_PATH):
        return None
    rest = candidate[len(PORTAL_PATH) :]
    if rest and rest[0] not in "/?":
        return None
    # Two separate rules that used to be spelled as one scan. A control
    # character is not something a portal address holds at all, and models.py
    # is where that is defined for the whole app; whitespace and the backslash
    # are what could break the value out of the query it travels in.
    if has_control_character(candidate):
        return None
    if any(c.isspace() or c == "\\" for c in candidate):
        return None
    login_page = settings.MAGIC_LINK_PATH
    if candidate == login_page or candidate.startswith(
        (f"{login_page}?", f"{login_page}/")
    ):
        return None
    return candidate


def build_login_url(user, next_path: str | None) -> str:
    """The link in the mail. `nazaj` carries where the shelter was going.

    The path travels in the link because a link from the mail opens a new
    tab, and the tab that asked for it has no way to hand the new one
    anything. Callers pass only what return_path accepted.
    """
    query = {"token": get_login_token(user)}
    if next_path:
        query["nazaj"] = next_path
    return f"{settings.FRONTEND_URL}{settings.MAGIC_LINK_PATH}?{urlencode(query)}"


def build_login_message(user, next_path: str | None) -> EmailMessage:
    """The login mail: plain text, UTF-8, a name on the From, a live Reply-To.

    DEFAULT_FROM_EMAIL is a send-only mailbox, so a shelter that answers this
    message has to reach a person some other way.
    """
    reply_to = settings.PORTAL_REPLY_TO_EMAIL
    message = EmailMessage(
        subject=EMAIL_SUBJECT,
        body=EMAIL_BODY.format(
            email=user.email,
            url=build_login_url(user, next_path),
            reply_to=reply_to,
        ),
        from_email=formataddr((settings.PORTAL_FROM_NAME, settings.DEFAULT_FROM_EMAIL)),
        to=[user.email],
        reply_to=[reply_to],
    )
    message.encoding = "utf-8"
    return message


def send_login_link(user, next_path: str | None) -> None:
    try:
        build_login_message(user, next_path).send()
    except Exception:
        # Email backends are extensible and aren't limited to OSError. Any
        # ordinary delivery failure must retain the same 204 response as an
        # unknown address; process-control exceptions still propagate because
        # this deliberately does not catch BaseException. The 204 is why the
        # marker is here: nothing else records that a shelter was told a link
        # is on its way and none was sent. The address is institutional.
        logger.exception("%s recipient=%s", DELIVERY_FAILED, user.email)


@router.get("/auth/csrf", auth=None, response=CsrfOut)
def csrf_token(request, response: HttpResponse):
    """Bootstrap the double-submit token required by unsafe API requests."""
    add_never_cache_headers(response)
    return {"csrfToken": get_csrf_token(request)}


@router.post(
    "/auth/request-link",
    auth=csrf_auth,
    throttle=request_link_throttle,
    response={204: None},
)
def request_link(request, payload: RequestLinkIn):
    """Always 204. The response never reveals whether the account exists."""
    email = payload.email.strip()
    # Read here and handed straight to the link. It is never logged or
    # stored: the mail is the only place it goes.
    next_path = return_path(payload.next)
    if email:
        user = (
            get_user_model()
            .objects.filter(
                email__iexact=email,
                is_active=True,
                shelter_memberships__isnull=False,
            )
            .order_by("pk")
            .first()
        )
        if user is not None:
            if address_send_allowed(user.email):
                send_login_link(user, next_path)
            else:
                # Still 204: the caller learns nothing either way, and the
                # shelter's inbox is what the limit protects.
                logger.info("%s recipient=%s", ADDRESS_THROTTLED, user.email)
    return Status(204, None)


@router.post("/auth/verify", auth=csrf_auth, response={200: MeOut, 401: ErrorOut})
def verify(request, payload: VerifyIn):
    user = get_user(payload.token)
    if user is None or not user.shelter_memberships.exists():
        return Status(401, {"detail": "invalid or expired token"})
    login(request, user, backend="sesame.backends.ModelBackend")
    return Status(200, me_payload(user))


@router.post("/auth/logout", response={204: None})
def logout(request):
    django_logout(request)
    return Status(204, None)


@router.get("/me", response=MeOut)
def me(request):
    return me_payload(request.user)
