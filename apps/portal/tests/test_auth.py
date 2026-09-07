import json
import logging
from urllib.parse import parse_qs, urlsplit

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
DEEP_LINK = "/portal/zival?zavetisce=testno&id=1"


def post(client, url, payload, **request_extra):
    csrf_token = client.get(CSRF).json()["csrfToken"]
    return client.post(
        url,
        data=json.dumps(payload),
        content_type="application/json",
        HTTP_X_CSRFTOKEN=csrf_token,
        **request_extra,
    )


def link_query(message) -> dict[str, list[str]]:
    """The query of the one link in a login mail, decoded."""
    links = [line for line in message.body.splitlines() if line.startswith("http")]
    assert len(links) == 1
    return parse_qs(urlsplit(links[0]).query)


@pytest.fixture
def link_attempts_per_ip(monkeypatch):
    """Set the per-IP limit on the request-link throttle for one test."""

    def set_limit(count: int, duration: int = 3600) -> None:
        monkeypatch.setattr(request_link_throttle, "num_requests", count)
        monkeypatch.setattr(request_link_throttle, "duration", duration)

    return set_limit


@pytest.fixture
def two_request_link_attempts(link_attempts_per_ip):
    link_attempts_per_ip(2)


@pytest.fixture
def unlimited_per_ip(link_attempts_per_ip):
    """The IP limit out of the way, so a test can exercise the address limit."""
    link_attempts_per_ip(100)


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
    assert "nazaj" not in link_query(message)


@pytest.mark.django_db
def test_request_link_carries_the_page_the_shelter_was_on(client, member):
    response = post(client, REQUEST_LINK, {"email": member.email, "next": DEEP_LINK})

    assert response.status_code == 204
    assert len(mail.outbox) == 1
    query = link_query(mail.outbox[0])
    assert query["token"]
    assert query["nazaj"] == [DEEP_LINK]
    # Encoded, so the page's own query does not run into the link's.
    assert "nazaj=%2Fportal%2Fzival%3Fzavetisce%3Dtestno%26id%3D1" in (
        mail.outbox[0].body
    )


# The same corpus as OUTSIDE_THE_PORTAL in
# apps/web/components/portal/portal-login.test.tsx, the other half of this rule.
@pytest.mark.django_db
@pytest.mark.parametrize(
    "planted",
    [
        "https://evil.example/portal",
        "//evil.example/portal",
        "javascript:alert(1)",
        "/portalx",
        "/zavetisca/ljubljana",
        "/portal/prijava",
        "/portal/prijava?token=abc",
        "/portal\\@evil.example",
        "/portal/zival?x=1\nlocation:https://evil.example",
        "/portal/zival?x=1 y",
        "/portal/zival?x=1\x00",
        # Control characters that are not a plain space: a C0 byte and a C1 one.
        "/portal/zival?id=testno:1\u0001",
        "/portal/zival?id=testno:1\u0085",
        "/portal/zival?id=" + "a" * 500,
        "",
    ],
)
def test_request_link_drops_a_page_outside_the_portal(client, member, planted):
    response = post(client, REQUEST_LINK, {"email": member.email, "next": planted})

    assert response.status_code == 204
    assert len(mail.outbox) == 1
    query = link_query(mail.outbox[0])
    assert query["token"]
    assert "nazaj" not in query
    assert "evil.example" not in mail.outbox[0].body


@pytest.mark.django_db
def test_request_link_with_a_page_still_tells_nothing_about_the_address(client):
    response = post(
        client, REQUEST_LINK, {"email": "kdorkoli@example.si", "next": DEEP_LINK}
    )

    assert response.status_code == 204
    assert mail.outbox == []


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
    client, link_attempts_per_ip, settings
):
    link_attempts_per_ip(1)
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
    client, link_attempts_per_ip, settings
):
    link_attempts_per_ip(1)
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
    client, link_attempts_per_ip, settings
):
    link_attempts_per_ip(1)
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
    client, link_attempts_per_ip, settings
):
    link_attempts_per_ip(1)
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
