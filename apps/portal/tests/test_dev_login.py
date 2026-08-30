import json

import pytest

from core.models import Shelter, ShelterMembership

SHELTERS = "/api/auth/dev/shelters"
LOGIN = "/api/auth/dev/login"
ME = "/api/me"
CSRF = "/api/auth/csrf"


def post(client, url, payload):
    csrf_token = client.get(CSRF).json()["csrfToken"]
    return client.post(
        url,
        data=json.dumps(payload),
        content_type="application/json",
        HTTP_X_CSRFTOKEN=csrf_token,
    )


@pytest.fixture
def dev_login_on(settings):
    settings.PORTAL_DEV_LOGIN = True


@pytest.fixture
def dev_login_off(settings):
    settings.PORTAL_DEV_LOGIN = False


@pytest.mark.django_db
def test_shelters_lists_the_registry_login(
    client, dev_login_on, shelter, other_shelter, member
):
    rows = client.get(SHELTERS).json()

    assert rows == [
        {
            "slug": "drugo",
            "name": "Zavetisce Drugo",
            "city": "Drugo",
            "email": "drugo@dev.invalid",
            "registered": False,
        },
        {
            "slug": "testno",
            "name": "Zavetisce Testno",
            "city": "Testno",
            "email": member.email,
            "registered": True,
        },
    ]


@pytest.mark.django_db
def test_login_opens_a_session_as_the_registry_login(
    client, dev_login_on, shelter, member
):
    response = post(client, LOGIN, {"slug": shelter.slug})

    assert response.status_code == 200
    assert response.json() == {
        "email": member.email,
        "shelters": [
            {"slug": shelter.slug, "name": shelter.name, "city": shelter.city}
        ],
    }
    assert client.get(ME).json()["email"] == member.email


@pytest.mark.django_db
def test_login_mints_a_login_for_a_shelter_without_one(
    client, dev_login_on, other_shelter
):
    response = post(client, LOGIN, {"slug": "drugo"})

    assert response.status_code == 200
    assert response.json()["email"] == "drugo@dev.invalid"
    assert ShelterMembership.objects.filter(shelter=other_shelter).count() == 1

    # Asking again reuses that login rather than piling up memberships.
    assert post(client, LOGIN, {"slug": "drugo"}).status_code == 200
    assert ShelterMembership.objects.filter(shelter=other_shelter).count() == 1


@pytest.mark.django_db
def test_login_rejects_an_unknown_slug(client, dev_login_on):
    assert post(client, LOGIN, {"slug": "ni-ga"}).status_code == 404


@pytest.mark.django_db
def test_both_routes_are_404_when_disabled(client, dev_login_off, shelter, member):
    assert client.get(SHELTERS).status_code == 404
    assert post(client, LOGIN, {"slug": shelter.slug}).status_code == 404
    assert client.get(ME).status_code == 401


@pytest.mark.django_db
def test_the_flag_cannot_be_on_without_debug(monkeypatch):
    """DEBUG is the real guard, not the variable."""
    import importlib

    from portal import settings as portal_settings

    monkeypatch.setenv("PORTAL_DEBUG", "false")
    monkeypatch.setenv("PORTAL_DEV_LOGIN", "true")
    monkeypatch.setenv("PORTAL_SECRET_KEY", "test-only")
    reloaded = importlib.reload(portal_settings)
    try:
        assert reloaded.DEBUG is False
        assert reloaded.PORTAL_DEV_LOGIN is False
    finally:
        monkeypatch.undo()
        importlib.reload(portal_settings)


@pytest.mark.django_db
def test_seeded_registry_covers_every_shelter(client, dev_login_on):
    """Every shelter is openable, address in the registry or not."""
    from django.core.management import call_command

    from .conftest import FIXTURES

    call_command("seed_shelters", "--path", str(FIXTURES / "shelters.yaml"))

    slugs = [row["slug"] for row in client.get(SHELTERS).json()]
    assert set(slugs) == set(Shelter.objects.values_list("slug", flat=True))

    for slug in slugs:
        assert post(client, LOGIN, {"slug": slug}).status_code == 200
