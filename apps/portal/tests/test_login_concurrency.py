"""One signed link must authenticate only one of two overlapping clients."""

import threading
from concurrent.futures import ThreadPoolExecutor

import pytest
import sesame.utils
from django.db import connections
from django.test import Client
from sesame.utils import get_token

from .test_auth import post


@pytest.mark.django_db(transaction=True)
def test_overlapping_verification_consumes_token_once(member, monkeypatch):
    token = get_token(member)
    authenticate = sesame.utils.authenticate
    start = threading.Barrier(2)
    validated = threading.Barrier(2)

    def overlap(*args, **kwargs):
        user = authenticate(*args, **kwargs)
        if user is not None:
            # Before the fix both requests could validate before either wrote
            # last_login. The transaction now keeps the second request outside;
            # the bounded wait lets the first finish and the second be rejected.
            try:
                validated.wait(timeout=1)
            except threading.BrokenBarrierError:
                pass
        return user

    monkeypatch.setattr(sesame.utils, "authenticate", overlap)

    def verify(_):
        try:
            browser = Client(enforce_csrf_checks=True)
            start.wait(timeout=10)
            response = post(browser, "/api/auth/verify", {"token": token})
            return response.status_code, browser.get("/api/me").status_code
        finally:
            connections.close_all()

    with ThreadPoolExecutor(max_workers=2) as pool:
        results = sorted(pool.map(verify, range(2)))
    assert results == [(200, 200), (401, 401)]
