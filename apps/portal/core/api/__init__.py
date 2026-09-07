from ninja import NinjaAPI
from ninja.errors import Throttled

from ..security import session_auth
from .animals import router as animals_router
from .auth import router as auth_router
from .dev import router as dev_router
from .export import router as export_router
from .listings import router as listings_router

api = NinjaAPI(
    title="Posvoji.si portal API",
    version="1.0.0",
    description="Shelter self service portal: logins and animal overrides.",
    auth=session_auth,
)


@api.exception_handler(Throttled)
def throttled(request, exc: Throttled):
    """429 that says how long the wait is.

    Without Retry-After the login page can only tell a shelter to try later,
    with no idea how much later. CORS_EXPOSE_HEADERS is what lets the browser
    read the header at all, because the API is on another origin.

    The status comes from the exception rather than being spelled again here.
    The detail does not: it is lowercased to match the rest of this API's
    messages ("shelter not found", "invalid or expired token"), and no shelter
    ever reads it, because the web client shows its own wording.
    """
    response = api.create_response(
        request, {"detail": "too many requests"}, status=exc.status_code
    )
    if exc.wait is not None:
        response["Retry-After"] = str(int(exc.wait))
    return response


api.add_router("", auth_router, tags=["auth"])
# Answers 404 for every route unless PORTAL_DEV_LOGIN is on, which DEBUG
# gates. Registered unconditionally so the check lives in one place.
api.add_router("", dev_router, tags=["dev"])
api.add_router("", animals_router, tags=["animals"])
# Answers 404 for every route unless the shelter is a manual one, which the
# router checks per request because it is a property of the shelter.
api.add_router("", listings_router, tags=["listings"])
api.add_router("", export_router, tags=["export"])

__all__ = ["api"]
