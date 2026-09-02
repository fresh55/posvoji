"""Settings for the Posvoji.si shelter portal.

The defaults are meant for local development only. An unset development
signing key is random for each process; production must set PORTAL_SECRET_KEY,
PORTAL_DEBUG=false, PORTAL_ALLOWED_HOSTS, FRONTEND_URL, CORS_ORIGINS and
PORTAL_EXPORT_TOKEN. README.md lists every environment setting.
"""

import os
import secrets
from pathlib import Path

from django.core.exceptions import ImproperlyConfigured

BASE_DIR = Path(__file__).resolve().parent.parent
# apps/portal -> apps -> repository root, where data/ lives.
REPO_ROOT = BASE_DIR.parent.parent


def _env_bool(name: str, default: bool) -> bool:
    raw = os.environ.get(name)
    if raw is None or raw == "":
        return default
    return raw.strip().lower() in {"1", "true", "yes", "on"}


def _env_list(name: str, default: list[str]) -> list[str]:
    raw = os.environ.get(name)
    if raw is None or raw.strip() == "":
        return default
    return [item.strip() for item in raw.split(",") if item.strip()]


def _env_optional_nonnegative_int(name: str) -> int | None:
    raw = os.environ.get(name)
    if raw is None or raw.strip() == "":
        return None
    try:
        value = int(raw)
    except ValueError as error:
        raise ImproperlyConfigured(f"{name} must be a non-negative integer") from error
    if value < 0:
        raise ImproperlyConfigured(f"{name} must be a non-negative integer")
    return value


DEBUG = _env_bool("PORTAL_DEBUG", True)
_PUBLISHED_DEVELOPMENT_SECRET_KEY = "dev-only-insecure-secret-key"
_configured_secret_key = os.environ.get("PORTAL_SECRET_KEY", "").strip()
if not DEBUG and (
    not _configured_secret_key
    or _configured_secret_key == _PUBLISHED_DEVELOPMENT_SECRET_KEY
):
    raise ImproperlyConfigured(
        "PORTAL_SECRET_KEY must be set to a private value when PORTAL_DEBUG=false"
    )
# Zero-configuration development remains convenient without giving every
# checkout one universal signing key. Restarting a process with no configured
# key deliberately invalidates its development sessions and login links.
SECRET_KEY = _configured_secret_key or secrets.token_urlsafe(50)
ALLOWED_HOSTS = _env_list("PORTAL_ALLOWED_HOSTS", ["localhost", "127.0.0.1"])

INSTALLED_APPS = [
    "django.contrib.admin",
    "django.contrib.auth",
    "django.contrib.contenttypes",
    "django.contrib.sessions",
    "django.contrib.messages",
    "django.contrib.staticfiles",
    "corsheaders",
    "core",
]

MIDDLEWARE = [
    "corsheaders.middleware.CorsMiddleware",
    "django.middleware.security.SecurityMiddleware",
    "django.contrib.sessions.middleware.SessionMiddleware",
    "django.middleware.common.CommonMiddleware",
    "django.middleware.csrf.CsrfViewMiddleware",
    "django.contrib.auth.middleware.AuthenticationMiddleware",
    "django.contrib.messages.middleware.MessageMiddleware",
    "django.middleware.clickjacking.XFrameOptionsMiddleware",
]

ROOT_URLCONF = "portal.urls"

TEMPLATES = [
    {
        "BACKEND": "django.template.backends.django.DjangoTemplates",
        "DIRS": [],
        "APP_DIRS": True,
        "OPTIONS": {
            "context_processors": [
                "django.template.context_processors.request",
                "django.contrib.auth.context_processors.auth",
                "django.contrib.messages.context_processors.messages",
            ],
        },
    },
]

WSGI_APPLICATION = "portal.wsgi.application"
ASGI_APPLICATION = "portal.asgi.application"

DATABASES = {
    "default": {
        "ENGINE": "django.db.backends.sqlite3",
        "NAME": os.environ.get("PORTAL_DB_PATH") or str(BASE_DIR / "db.sqlite3"),
    }
}

AUTH_PASSWORD_VALIDATORS = [
    {
        "NAME": "django.contrib.auth.password_validation."
        "UserAttributeSimilarityValidator"
    },
    {"NAME": "django.contrib.auth.password_validation.MinimumLengthValidator"},
    {"NAME": "django.contrib.auth.password_validation.CommonPasswordValidator"},
    {"NAME": "django.contrib.auth.password_validation.NumericPasswordValidator"},
]

# Shelter staff never get a password. django-sesame signs a short lived token
# that the portal turns into a normal session.
AUTHENTICATION_BACKENDS = [
    "sesame.backends.ModelBackend",
    "django.contrib.auth.backends.ModelBackend",
]
SESAME_MAX_AGE = 3600
# Opening a link changes last_login and invalidates that token. A forwarded or
# leaked link therefore cannot be replayed for the rest of its one-hour life.
SESAME_ONE_TIME = True

# POST /auth/request-link is deliberately anonymous, but one client must not
# be able to make the service send an unlimited number of messages. The
# throttle always keys by client IP; csrf_auth's constant request.auth is not
# an identity. Forwarded addresses remain untrusted unless the deployment
# explicitly states how many rightmost proxy hops it controls. The narrow
# exception is one same-host proxy hop, identified by a loopback direct peer.
PORTAL_LOGIN_LINK_RATE = (
    os.environ.get("PORTAL_LOGIN_LINK_RATE", "5/hour").strip() or "5/hour"
)
PORTAL_TRUSTED_PROXY_COUNT = _env_optional_nonnegative_int("PORTAL_TRUSTED_PROXY_COUNT")

# Development only: /api/auth/dev/* lists every shelter and opens a session as
# any of them without a mail round trip. `DEBUG and` is the real guard, so
# setting the variable on a deployment does nothing. The default is off as
# well, so a deployment that forgets PORTAL_DEBUG does not also get an
# unauthenticated sign in as any shelter.
PORTAL_DEV_LOGIN = DEBUG and _env_bool("PORTAL_DEV_LOGIN", False)

LANGUAGE_CODE = "sl"
TIME_ZONE = "Europe/Ljubljana"
USE_I18N = True
USE_TZ = True

STATIC_URL = "static/"
STATIC_ROOT = BASE_DIR / "staticfiles"
DEFAULT_AUTO_FIELD = "django.db.models.BigAutoField"

# Photographs uploaded with manual listings. Django serves them itself while
# DEBUG is on; a deployment serves MEDIA_ROOT from nginx, see README.md.
MEDIA_ROOT = Path(os.environ.get("PORTAL_MEDIA_ROOT") or BASE_DIR / "media")
MEDIA_URL = "/media/"

# Where this service answers from, prefixed onto every photo URL in the
# export. The ingest pipeline fetches those from another host, so a path
# relative to MEDIA_URL is not enough.
PORTAL_PUBLIC_URL = (
    os.environ.get("PORTAL_PUBLIC_URL") or "http://localhost:8000"
).rstrip("/")

# Hard cap on one uploaded photograph, before it is decoded. The portal
# re-encodes everything it accepts, so what a shelter sends is only ever an
# input to that, never what is stored.
PORTAL_MAX_UPLOAD_BYTES = 15 * 1024 * 1024

# The portal and the API are same site in both environments
# (localhost:3000 -> localhost:8000, posvoji.si -> api.posvoji.si), so a Lax
# session cookie is sent with the frontend's fetch calls. CORS controls which
# origins may read responses; Django's CSRF token separately protects every
# state-changing browser request.
SESSION_COOKIE_SAMESITE = "Lax"
SESSION_COOKIE_HTTPONLY = True
SESSION_COOKIE_SECURE = _env_bool("PORTAL_SECURE_COOKIES", not DEBUG)
SESSION_COOKIE_DOMAIN = os.environ.get("PORTAL_SESSION_COOKIE_DOMAIN") or None
SESSION_COOKIE_AGE = int(os.environ.get("PORTAL_SESSION_AGE", 60 * 60 * 24 * 14))
CSRF_COOKIE_SECURE = SESSION_COOKIE_SECURE

CORS_ALLOWED_ORIGINS = _env_list("CORS_ORIGINS", ["http://localhost:3000"])
CORS_ALLOW_CREDENTIALS = True
CSRF_TRUSTED_ORIGINS = CORS_ALLOWED_ORIGINS

EMAIL_BACKEND = os.environ.get("PORTAL_EMAIL_BACKEND") or (
    "django.core.mail.backends.console.EmailBackend"
    if DEBUG
    else "django.core.mail.backends.smtp.EmailBackend"
)
EMAIL_HOST = os.environ.get("PORTAL_EMAIL_HOST", "localhost")
EMAIL_PORT = int(os.environ.get("PORTAL_EMAIL_PORT", "25"))
EMAIL_HOST_USER = os.environ.get("PORTAL_EMAIL_USER", "")
EMAIL_HOST_PASSWORD = os.environ.get("PORTAL_EMAIL_PASSWORD", "")
EMAIL_USE_TLS = _env_bool("PORTAL_EMAIL_USE_TLS", False)
DEFAULT_FROM_EMAIL = os.environ.get("PORTAL_FROM_EMAIL", "portal@posvoji.si")

# Where the frontend serves the magic link landing page.
FRONTEND_URL = os.environ.get("FRONTEND_URL", "http://localhost:3000").rstrip("/")
MAGIC_LINK_PATH = "/portal/prijava"

# Read only inputs from the rest of the repo.
DATASET_PATH = Path(
    os.environ.get("DATASET_PATH") or REPO_ROOT / "data" / "dist" / "animals.json"
)
SHELTERS_YAML_PATH = Path(
    os.environ.get("SHELTERS_YAML") or REPO_ROOT / "data" / "shelters.yaml"
)
# One providers/<slug>/policy.yaml per shelter. seed_shelters reads the
# `ingestion` key out of it and nothing else.
PROVIDERS_PATH = Path(os.environ.get("PROVIDERS_DIR") or REPO_ROOT / "providers")

# Bearer token the ingest pipeline uses to pull the overrides. Unset means the
# export endpoint is disabled.
PORTAL_EXPORT_TOKEN = os.environ.get("PORTAL_EXPORT_TOKEN", "")

LOGGING = {
    "version": 1,
    "disable_existing_loggers": False,
    "handlers": {"console": {"class": "logging.StreamHandler"}},
    "root": {"handlers": ["console"], "level": "INFO"},
}
