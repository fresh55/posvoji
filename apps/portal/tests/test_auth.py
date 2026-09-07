import json
import logging

import pytest
from django.core import mail
from django.test import Client
from sesame.utils import get_token

from core.api.auth import ADDRESS_THROTTLED, DELIVERY_FAILED
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


@pytest.fixture
def two_request_link_attempts(monkeypatch):
    monkeypatch.setattr(request_link_throttle, "num_requests", 2)
    monkeypatch.setattr(request_link_throttle, "duration", 3600)


@pytest.fixture
def unlimited_per_ip(monkeypatch):
    """The IP limit out of the way, so a test can exercise the address limit."""
    monkeypatch.setattr(request_link_throttle, "num_requests", 100)
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
    # Quoted because the display name holds a dot, which is what formataddr is
    # for. A client shows Posvoji.si, not a bare portal@ address.
    assert message.from_email == '"Posvoji.si" <portal@posvoji.si>'
    assert message.reply_to == ["info@posvoji.si"]
    assert "http://localhost:3000/portal/prijava?token=" in message.body
    assert member.email in message.body
    assert "24 ur" in message.body
    assert "deluje samo enkrat" in message.body
    # Written in Slovenian, not in Slovenian with the diacritics filed off.
    assert "zavetišča" in message.body
    assert "info@posvoji.si" in message.body


@pytest.mark.django_db
def test_request_link_keeps_uniform_response_when_email_backend_fails(
    client, member, monkeypatch, caplog
):
    def fail_to_send(self, *args, **kwargs):
        raise RuntimeError("backend-specific delivery failure")

    monkeypatch.setattr("core.api.auth.EmailMessage.send", fail_to_send)

    response = post(client, REQUEST_LINK, {"email": member.email})

    assert response.status_code == 204
    assert DELIVERY_FAILED in caplog.text
    assert member.email in caplog.text


@pytest.mark.django_db
def test_request_link_stops_repeats_to_one_address(
    client, member, second_member, unlimited_per_ip, settings, caplog
):
    caplog.set_level(logging.INFO)
    settings.PORTAL_LOGIN_LINK_ADDRESS_RATE = "3/hour"

    for _ in range(3):
        assert post(client, REQUEST_LINK, {"email": member.email}).status_code == 204
    assert len(mail.outbox) == 3

    fourth = post(client, REQUEST_LINK, {"email": member.email})

    assert fourth.status_code == 204
    assert len(mail.outbox) == 3
    assert ADDRESS_THROTTLED in caplog.text

    other = post(client, REQUEST_LINK, {"email": second_member.email})

    assert other.status_code == 204
    assert len(mail.outbox) == 4
    assert mail.outbox[-1].to == [second_member.email]


@pytest.mark.django_db
def test_request_link_counts_one_address_however_it_is_written(
    client, member, unlimited_per_ip, settings
):
    settings.PORTAL_LOGIN_LINK_ADDRESS_RATE = "1/hour"

    assert post(client, REQUEST_LINK, {"email": member.email}).status_code == 204
    assert post(client, REQUEST_LINK, {"email": " INFO@Example.SI "}).status_code == 204

    assert len(mail.outbox) == 1


@pytest.mark.django_db
def test_request_link_rate_limits_one_ip(client, two_request_link_attempts):
    request = {"email": "kdorkoli@example.si"}
    remote_addr = {"REMOTE_ADDR": "192.0.2.10"}

    assert post(client, REQUEST_LINK, request, **remote_addr).status_code == 204
    assert post(client, REQUEST_LINK, request, **remote_addr).status_code == 204

    refused = post(client, REQUEST_LINK, request, **remote_addr)

    assert refused.status_code == 429
    assert refused.json() == {"detail": "too many requests"}
    # How long the wait is, which the login page has no other way to know.
    assert 0 < int(refused.headers["Retry-After"]) <= 3600


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
            {
                "slug": shelter.slug,
                "name": shelter.name,
                "city": shelter.city,
                "ingestion": "scrape",
            }
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
