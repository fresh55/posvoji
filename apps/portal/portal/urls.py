from django.conf import settings
from django.conf.urls.static import static
from django.contrib import admin
from django.urls import path

from core.admin_animals import all_animals
from core.api import api

urlpatterns = [
    # Before the admin's own patterns, which end in a catch-all that would
    # read "zivali" as an app label. admin_view is what makes it an admin
    # page rather than a second entrance: it turns away anyone who is not
    # staff and sends them to the admin login.
    path("admin/zivali/", admin.site.admin_view(all_animals), name="all-animals"),
    path("admin/", admin.site.urls),
    path("api/", api.urls),
]

# Development only. static() returns nothing while DEBUG is off, and a
# deployment serves MEDIA_ROOT from nginx instead.
urlpatterns += static(settings.MEDIA_URL, document_root=settings.MEDIA_ROOT)
