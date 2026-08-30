import json

import pytest
from django.conf import settings as django_settings
from django.core import mail
from django.test import Client
from sesame.utils import get_token

from core.models import AnimalOverride

from .conftest import make_animal

CSRF = "/api/auth/csrf"
REQUEST_LINK = "/api/auth/request-link"
VERIFY = "/api/auth/verify"
LOGOUT = "/api/auth/logout"
ME = "/api/me"
DEV_LOGIN = "/api/auth/dev/login"
TRUSTED_ORIGIN = "http://localhost:3000"


def post_json(client, url, payload, **headers):
    return client.post(
        url,
        data=json.dumps(payload),
        content_type="application/json",
        **headers,
    )


def put_json(client, url, payload, **headers):
    return client.put(
        url,
        data=json.dumps(payload),
        content_type="application/json",
        **headers,
    )


def csrf_headers(client, origin=TRUSTED_ORIGIN):
    response = client.get(CSRF)
    assert response.status_code == 200
    return {
        "HTTP_ORIGIN": origin,
        "HTTP_X_CSRFTOKEN": response.json()["csrfToken"],
    }


def strict_client():
    return Client(enforce_csrf_checks=True)


def test_csrf_endpoint_sets_the_cookie_and_is_never_cached():
    client = strict_client()

    response = client.get(CSRF)

    assert response.status_code == 200
    assert response.json()["csrfToken"]
    assert django_settings.CSRF_COOKIE_NAME in response.cookies
    assert "no-store" in response.headers["Cache-Control"]
    assert "private" in response.headers["Cache-Control"]


@pytest.mark.django_db
def test_an_anonymous_post_rejects_a_missing_csrf_token(member):
    client = strict_client()

    response = post_json(
        client,
        REQUEST_LINK,
        {"email": member.email},
        HTTP_ORIGIN=TRUSTED_ORIGIN,
    )

    assert response.status_code == 403
    assert mail.outbox == []


@pytest.mark.django_db
def test_an_anonymous_post_rejects_an_untrusted_origin(member):
    client = strict_client()
    headers = csrf_headers(client, origin="https://attacker.example")

    response = post_json(client, REQUEST_LINK, {"email": member.email}, **headers)

    assert response.status_code == 403
    assert mail.outbox == []


@pytest.mark.django_db
def test_an_anonymous_post_accepts_a_trusted_origin_and_token(member):
    client = strict_client()

    response = post_json(
        client,
        REQUEST_LINK,
        {"email": member.email},
        **csrf_headers(client),
    )

    assert response.status_code == 204
    assert len(mail.outbox) == 1


@pytest.mark.django_db
def test_verify_accepts_a_trusted_origin_and_token(member):
    client = strict_client()
    token = get_token(member)

    response = post_json(
        client,
        VERIFY,
        {"token": token},
        **csrf_headers(client),
    )

    assert response.status_code == 200
    assert client.get(ME).status_code == 200


@pytest.mark.django_db
def test_dev_login_accepts_a_trusted_origin_and_token(settings, shelter, member):
    settings.PORTAL_DEV_LOGIN = True
    client = strict_client()

    response = post_json(
        client,
        DEV_LOGIN,
        {"slug": shelter.slug},
        **csrf_headers(client),
    )

    assert response.status_code == 200
    assert client.get(ME).status_code == 200


@pytest.mark.django_db
def test_session_update_rejects_a_missing_csrf_token(member, shelter, dataset_file):
    dataset_file([make_animal("testno:1", shelter)])
    client = strict_client()
    client.force_login(member)

    response = put_json(
        client,
        f"/api/shelters/{shelter.slug}/animals/testno:1",
        {"name": "Belka"},
        HTTP_ORIGIN=TRUSTED_ORIGIN,
    )

    assert response.status_code == 403
    assert AnimalOverride.objects.count() == 0


@pytest.mark.django_db
def test_session_update_accepts_a_trusted_origin_and_token(
    member, shelter, dataset_file
):
    dataset_file([make_animal("testno:1", shelter)])
    client = strict_client()
    client.force_login(member)

    response = put_json(
        client,
        f"/api/shelters/{shelter.slug}/animals/testno:1",
        {"name": "Belka"},
        **csrf_headers(client),
    )

    assert response.status_code == 200
    assert AnimalOverride.objects.get().name == "Belka"


@pytest.mark.django_db
def test_logout_requires_a_session_even_with_a_csrf_token():
    client = strict_client()

    response = post_json(client, LOGOUT, {}, **csrf_headers(client))

    assert response.status_code == 401


@pytest.mark.django_db
def test_logout_accepts_a_session_and_csrf_token(member):
    client = strict_client()
    client.force_login(member)

    response = post_json(client, LOGOUT, {}, **csrf_headers(client))

    assert response.status_code == 204
    assert client.get(ME).status_code == 401
