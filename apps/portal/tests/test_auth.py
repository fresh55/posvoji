import json

import pytest
from django.core import mail
from django.core.cache import cache
from django.test import Client
from sesame.utils import get_token

from core.security import request_link_throttle

REQUEST_LINK = "/api/auth/request-link"
VERIFY = "/api/auth/verify"
LOGOUT = "/api/auth/logout"
ME = "/api/me"
CSRF = "/api/auth/csrf"


def post(client, url, payload, **request_extra):
    csrf_token = client.get(CSRF).json()["csrfToken"]
    return client.post(
        url,
        data=json.dumps(payload),
        content_type="application/json",
        HTTP_X_CSRFTOKEN=csrf_token,
        **request_extra,
    )


@pytest.fixture(autouse=True)
def clear_request_link_throttle_cache():
    cache.clear()
    yield
    cache.clear()


@pytest.fixture
def two_request_link_attempts(monkeypatch):
    monkeypatch.setattr(request_link_throttle, "num_requests", 2)
    monkeypatch.setattr(request_link_throttle, "duration", 3600)


@pytest.mark.django_db
def test_request_link_for_unknown_email_returns_204_and_sends_nothing(client):
    response = post(client, REQUEST_LINK, {"email": "kdorkoli@example.si"})

    assert response.status_code == 204
    assert mail.outbox == []


@pytest.mark.django_db
def test_request_link_without_membership_sends_nothing(client, outsider):
    response = post(client, REQUEST_LINK, {"email": outsider.email})

    assert response.status_code == 204
    assert mail.outbox == []


@pytest.mark.django_db
def test_request_link_emails_a_member(client, member):
    response = post(client, REQUEST_LINK, {"email": "INFO@Example.SI"})

    assert response.status_code == 204
    assert len(mail.outbox) == 1
    message = mail.outbox[0]
    assert message.to == [member.email]
    assert "http://localhost:3000/portal/prijava?token=" in message.body
    assert "uporabiti samo enkrat" in message.body


@pytest.mark.django_db
def test_request_link_keeps_uniform_response_when_email_backend_fails(
    client, member, monkeypatch, caplog
):
    def fail_to_send(*args, **kwargs):
        raise RuntimeError("backend-specific delivery failure")

    monkeypatch.setattr("core.api.auth.send_mail", fail_to_send)

    response = post(client, REQUEST_LINK, {"email": member.email})

    assert response.status_code == 204
    assert "could not send a login link" in caplog.text


@pytest.mark.django_db
def test_request_link_rate_limits_one_ip(client, two_request_link_attempts):
    request = {"email": "kdorkoli@example.si"}
    remote_addr = {"REMOTE_ADDR": "192.0.2.10"}

    assert post(client, REQUEST_LINK, request, **remote_addr).status_code == 204
    assert post(client, REQUEST_LINK, request, **remote_addr).status_code == 204
    assert post(client, REQUEST_LINK, request, **remote_addr).status_code == 429


@pytest.mark.django_db
def test_request_link_rate_limit_is_independent_per_ip(
    client, two_request_link_attempts
):
    request = {"email": "kdorkoli@example.si"}

    for _ in range(2):
        assert (
            post(
                client,
                REQUEST_LINK,
                request,
                REMOTE_ADDR="192.0.2.10",
            ).status_code
            == 204
        )

    assert (
        post(
            client,
            REQUEST_LINK,
            request,
            REMOTE_ADDR="192.0.2.11",
        ).status_code
        == 204
    )


@pytest.mark.django_db
def test_request_link_ignores_forwarded_for_from_a_non_loopback_peer_by_default(
    client, monkeypatch, settings
):
    monkeypatch.setattr(request_link_throttle, "num_requests", 1)
    monkeypatch.setattr(request_link_throttle, "duration", 3600)
    settings.PORTAL_TRUSTED_PROXY_COUNT = None
    request = {"email": "kdorkoli@example.si"}

    first = post(
        client,
        REQUEST_LINK,
        request,
        REMOTE_ADDR="192.0.2.10",
        HTTP_X_FORWARDED_FOR="198.51.100.1",
    )
    spoofed = post(
        client,
        REQUEST_LINK,
        request,
        REMOTE_ADDR="192.0.2.10",
        HTTP_X_FORWARDED_FOR="198.51.100.2",
    )

    assert first.status_code == 204
    assert spoofed.status_code == 429


@pytest.mark.django_db
def test_request_link_uses_forwarded_for_from_a_loopback_proxy_by_default(
    client, monkeypatch, settings
):
    monkeypatch.setattr(request_link_throttle, "num_requests", 1)
    monkeypatch.setattr(request_link_throttle, "duration", 3600)
    settings.PORTAL_TRUSTED_PROXY_COUNT = None
    request = {"email": "kdorkoli@example.si"}

    first = post(
        client,
        REQUEST_LINK,
        request,
        REMOTE_ADDR="127.0.0.1",
        HTTP_X_FORWARDED_FOR="198.51.100.1",
    )
    other_client = post(
        client,
        REQUEST_LINK,
        request,
        REMOTE_ADDR="127.0.0.1",
        HTTP_X_FORWARDED_FOR="198.51.100.2",
    )

    assert first.status_code == 204
    assert other_client.status_code == 204


@pytest.mark.django_db
def test_request_link_can_ignore_forwarded_for_from_a_loopback_proxy(
    client, monkeypatch, settings
):
    monkeypatch.setattr(request_link_throttle, "num_requests", 1)
    monkeypatch.setattr(request_link_throttle, "duration", 3600)
    settings.PORTAL_TRUSTED_PROXY_COUNT = 0
    request = {"email": "kdorkoli@example.si"}

    first = post(
        client,
        REQUEST_LINK,
        request,
        REMOTE_ADDR="127.0.0.1",
        HTTP_X_FORWARDED_FOR="198.51.100.1",
    )
    spoofed = post(
        client,
        REQUEST_LINK,
        request,
        REMOTE_ADDR="127.0.0.1",
        HTTP_X_FORWARDED_FOR="198.51.100.2",
    )

    assert first.status_code == 204
    assert spoofed.status_code == 429


@pytest.mark.django_db
def test_request_link_uses_forwarded_for_with_a_configured_proxy_count(
    client, monkeypatch, settings
):
    monkeypatch.setattr(request_link_throttle, "num_requests", 1)
    monkeypatch.setattr(request_link_throttle, "duration", 3600)
    settings.PORTAL_TRUSTED_PROXY_COUNT = 1
    request = {"email": "kdorkoli@example.si"}

    first = post(
        client,
        REQUEST_LINK,
        request,
        REMOTE_ADDR="192.0.2.10",
        HTTP_X_FORWARDED_FOR="198.51.100.1",
    )
    other_client = post(
        client,
        REQUEST_LINK,
        request,
        REMOTE_ADDR="192.0.2.10",
        HTTP_X_FORWARDED_FOR="198.51.100.2",
    )

    assert first.status_code == 204
    assert other_client.status_code == 204


@pytest.mark.django_db
def test_verify_opens_a_session_and_me_returns_the_shelters(client, member, shelter):
    expected = {
        "email": member.email,
        "shelters": [
            {"slug": shelter.slug, "name": shelter.name, "city": shelter.city}
        ],
    }

    verified = post(client, VERIFY, {"token": get_token(member)})
    assert verified.status_code == 200
    assert verified.json() == expected

    me = client.get(ME)
    assert me.status_code == 200
    assert me.json() == expected


@pytest.mark.django_db
def test_verify_rejects_replaying_a_login_link(client, member):
    token = get_token(member)

    assert post(client, VERIFY, {"token": token}).status_code == 200
    replay_client = Client()
    assert post(replay_client, VERIFY, {"token": token}).status_code == 401
    assert replay_client.get(ME).status_code == 401


@pytest.mark.django_db
def test_me_returns_an_empty_city_when_the_registry_has_none(member_client, shelter):
    shelter.city = ""
    shelter.save()

    response = member_client.get(ME)

    assert response.status_code == 200
    assert response.json()["shelters"][0]["city"] == ""


@pytest.mark.django_db
def test_verify_rejects_an_invalid_token(client):
    response = post(client, VERIFY, {"token": "not-a-token"})

    assert response.status_code == 401
    assert client.get(ME).status_code == 401


@pytest.mark.django_db
def test_verify_rejects_a_user_without_membership(client, outsider):
    response = post(client, VERIFY, {"token": get_token(outsider)})

    assert response.status_code == 401


@pytest.mark.django_db
def test_me_requires_a_session(client):
    assert client.get(ME).status_code == 401


@pytest.mark.django_db
def test_logout_ends_the_session(member_client):
    assert member_client.get(ME).status_code == 200

    response = post(member_client, LOGOUT, {})

    assert response.status_code == 204
    assert member_client.get(ME).status_code == 401
