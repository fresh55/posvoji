from django.conf import settings
from django.conf.urls.static import static
from django.contrib import admin
from django.urls import path

from core.api import api

urlpatterns = [
    path("admin/", admin.site.urls),
    path("api/", api.urls),
]

# Development only. static() returns nothing while DEBUG is off, and a
# deployment serves MEDIA_ROOT from nginx instead.
urlpatterns += static(settings.MEDIA_URL, document_root=settings.MEDIA_ROOT)
