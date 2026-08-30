"""Creating the passwordless logins the portal authenticates.

Shelter staff never get a password. Both the registry seed and the
development shelter picker mint a user the same way, so the login a shelter
receives by mail and the one a developer opens are the same record.
"""

from django.contrib.auth import get_user_model

USERNAME_MAX_LENGTH = 150


def unique_username(email: str) -> str:
    """The address itself, with a numeric tail only when it is taken."""
    user_model = get_user_model()
    base = email.strip().lower()[:USERNAME_MAX_LENGTH]
    candidate = base
    suffix = 2
    while user_model.objects.filter(username=candidate).exists():
        tail = f"-{suffix}"
        candidate = f"{base[: USERNAME_MAX_LENGTH - len(tail)]}{tail}"
        suffix += 1
    return candidate


def ensure_user(email: str) -> tuple[object, bool]:
    """The user behind an address, created without a password if it is new."""
    user_model = get_user_model()
    user = user_model.objects.filter(email__iexact=email).order_by("pk").first()
    if user is not None:
        return user, False
    # No password is ever set: the portal authenticates by magic link only.
    user = user_model.objects.create_user(
        username=unique_username(email),
        email=email,
        password=None,
    )
    return user, True
