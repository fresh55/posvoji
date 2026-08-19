"""Passwordless login.

A shelter asks for a link, django-sesame signs a token that is valid for an
hour, and posting that token back opens a normal Django session.
"""

import logging
from urllib.parse import urlencode

from django.conf import settings
from django.contrib.auth import get_user_model, login
from django.contrib.auth import logout as django_logout
from django.core.mail import send_mail
from ninja import Router, Status
from sesame.utils import get_token, get_user

from ..models import Shelter
from ..schemas import ErrorOut, MeOut, RequestLinkIn, VerifyIn

logger = logging.getLogger(__name__)
router = Router()

EMAIL_SUBJECT = "Prijava v portal Posvoji.si"
EMAIL_BODY = (
    "Pozdravljeni,\n\n"
    "s to povezavo se prijavite v portal Posvoji.si:\n\n"
    "{url}\n\n"
    "Povezava velja eno uro in jo je mogoce uporabiti veckrat do izteka.\n"
    "Ce prijave niste zahtevali, sporocilo prezrite.\n"
)


def me_payload(user) -> dict:
    shelters = Shelter.objects.filter(memberships__user=user).order_by("name")
    return {
        "email": user.email,
        "shelters": [{"slug": s.slug, "name": s.name} for s in shelters],
    }


def build_login_url(user) -> str:
    query = urlencode({"token": get_token(user)})
    return f"{settings.FRONTEND_URL}{settings.MAGIC_LINK_PATH}?{query}"


def send_login_link(user) -> None:
    try:
        send_mail(
            subject=EMAIL_SUBJECT,
            message=EMAIL_BODY.format(url=build_login_url(user)),
            from_email=settings.DEFAULT_FROM_EMAIL,
            recipient_list=[user.email],
        )
    except OSError:
        # A failed send must not change the response, otherwise the endpoint
        # would tell the caller which addresses exist.
        logger.exception("could not send a login link")


@router.post("/auth/request-link", auth=None, response={204: None})
def request_link(request, payload: RequestLinkIn):
    """Always 204. The response never reveals whether the account exists."""
    email = payload.email.strip()
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
            send_login_link(user)
    return Status(204, None)


@router.post("/auth/verify", auth=None, response={200: MeOut, 401: ErrorOut})
def verify(request, payload: VerifyIn):
    user = get_user(payload.token)
    if user is None or not user.shelter_memberships.exists():
        return Status(401, {"detail": "invalid or expired token"})
    login(request, user, backend="sesame.backends.ModelBackend")
    return Status(200, me_payload(user))


@router.post("/auth/logout", auth=None, response={204: None})
def logout(request):
    django_logout(request)
    return Status(204, None)


@router.get("/me", response=MeOut)
def me(request):
    return me_payload(request.user)
