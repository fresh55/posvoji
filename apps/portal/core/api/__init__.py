from ninja import NinjaAPI

from ..security import session_auth
from .animals import router as animals_router
from .auth import router as auth_router
from .export import router as export_router

api = NinjaAPI(
    title="Posvoji.si portal API",
    version="1.0.0",
    description="Shelter self service portal: logins and animal overrides.",
    auth=session_auth,
)

api.add_router("", auth_router, tags=["auth"])
api.add_router("", animals_router, tags=["animals"])
api.add_router("", export_router, tags=["export"])

__all__ = ["api"]
