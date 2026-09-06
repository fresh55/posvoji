"""Parallel writes against one SQLite file.

The live server handles every request on a thread of its own, each with its
own database connection, which is what the development server and gunicorn
do as well. Ten requests that land at once on the same table are the case
that used to answer "database is locked": SQLite ignores select_for_update,
and a deferred transaction only asks for the write lock at its first write,
by which time another request may hold it. portal/settings.py opens every
transaction as IMMEDIATE and gives writers a busy timeout, so they queue.

These tests need the file-backed test database from conftest.py. On an
in-memory database every server thread shares one connection and nothing
here runs in parallel at all.
"""

import json
import threading
import urllib.error
import urllib.request
from http.cookies import SimpleCookie

import pytest
from django.conf import settings

from core.models import AnimalOverride

from .conftest import make_animal

THREADS = 10

# One value per field, so ten requests that each set a different field on the
# same row prove that none of them overwrote another one's write.
ONE_ANIMAL_FIELDS = {
    "name": "Belka",
    "shortDescription": "Mirna psicka.",
    "status": "reserved",
    "sex": "female",
    "breed": "mesanka",
    "birthDate": "2024-05-01",
    "approximateAgeMonths": 27,
    "size": "medium",
    "energy": "calm",
    "goodWithKids": "yes",
}


def http(url, method="GET", payload=None, headers=None):
    """One raw request, because the test client never leaves the test thread."""
    body = None if payload is None else json.dumps(payload).encode()
    request = urllib.request.Request(
        url, data=body, method=method, headers=headers or {}
    )
    if body is not None:
        request.add_header("Content-Type", "application/json")
    try:
        with urllib.request.urlopen(request, timeout=60) as response:
            return response.status, json.loads(response.read()), response.headers
    except urllib.error.HTTPError as error:
        return error.code, error.read().decode(errors="replace"), error.headers


def in_parallel(calls):
    """Runs every call at the same moment and returns the results in order."""
    barrier = threading.Barrier(len(calls))
    results = [None] * len(calls)

    def run(index, call):
        barrier.wait()
        results[index] = call()

    threads = [
        threading.Thread(target=run, args=(index, call))
        for index, call in enumerate(calls)
    ]
    for thread in threads:
        thread.start()
    for thread in threads:
        thread.join()
    return results


@pytest.fixture
def put(live_server, client, member):
    """PUT against the live server as the member, with the session and CSRF
    cookies and the CSRF header a browser would send."""
    client.force_login(member)
    session_id = client.cookies[settings.SESSION_COOKIE_NAME].value

    status, body, headers = http(f"{live_server.url}/api/auth/csrf")
    assert status == 200
    cookies = SimpleCookie()
    for header in headers.get_all("Set-Cookie"):
        cookies.load(header)
    csrf_cookie = cookies[settings.CSRF_COOKIE_NAME].value

    headers = {
        "Cookie": (
            f"{settings.SESSION_COOKIE_NAME}={session_id}; "
            f"{settings.CSRF_COOKIE_NAME}={csrf_cookie}"
        ),
        "X-CSRFToken": body["csrfToken"],
    }

    def send(slug, animal_id, payload):
        return http(
            f"{live_server.url}/api/shelters/{slug}/animals/{animal_id}",
            "PUT",
            payload,
            headers,
        )

    return send


@pytest.mark.django_db(transaction=True)
def test_parallel_puts_on_one_animal_lose_nothing(put, shelter, dataset_file):
    dataset_file([make_animal("testno:1", shelter, name="Bela")])

    results = in_parallel(
        [
            lambda key=key, value=value: put(shelter.slug, "testno:1", {key: value})
            for key, value in ONE_ANIMAL_FIELDS.items()
        ]
    )

    statuses = [status for status, _, _ in results]
    assert statuses == [200] * THREADS, " ".join(map(str, statuses))
    override = AnimalOverride.objects.get()
    assert override.overridden_fields() == ONE_ANIMAL_FIELDS
    assert set(override.baseline) == set(ONE_ANIMAL_FIELDS)


@pytest.mark.django_db(transaction=True)
def test_parallel_puts_on_ten_animals_all_land(put, shelter, dataset_file):
    dataset_file([make_animal(f"testno:{index}", shelter) for index in range(THREADS)])

    results = in_parallel(
        [
            lambda index=index: put(
                shelter.slug, f"testno:{index}", {"name": f"Ime {index}"}
            )
            for index in range(THREADS)
        ]
    )

    statuses = [status for status, _, _ in results]
    assert statuses == [200] * THREADS, " ".join(map(str, statuses))
    assert {row.animal_id: row.name for row in AnimalOverride.objects.all()} == {
        f"testno:{index}": f"Ime {index}" for index in range(THREADS)
    }
