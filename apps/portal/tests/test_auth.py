import json

import pytest
from django.core import mail
from sesame.utils import get_token

REQUEST_LINK = "/api/auth/request-link"
VERIFY = "/api/auth/verify"
LOGOUT = "/api/auth/logout"
ME = "/api/me"


def post(client, url, payload):
    return client.post(url, data=json.dumps(payload), content_type="application/json")


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

    response = member_client.post(LOGOUT)

    assert response.status_code == 204
    assert member_client.get(ME).status_code == 401
