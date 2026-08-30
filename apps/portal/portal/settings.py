"""Settings for the Posvoji.si shelter portal.

Every secret is read from the environment. The defaults are meant for local
development only. Production must set PORTAL_SECRET_KEY, PORTAL_DEBUG=false,
PORTAL_ALLOWED_HOSTS, FRONTEND_URL, CORS_ORIGINS and PORTAL_EXPORT_TOKEN.
README.md lists them all.
"""

import os
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


DEBUG = _env_bool("PORTAL_DEBUG", True)
_DEVELOPMENT_SECRET_KEY = "dev-only-insecure-secret-key"
_configured_secret_key = os.environ.get("PORTAL_SECRET_KEY", "").strip()
if not DEBUG and (
    not _configured_secret_key or _configured_secret_key == _DEVELOPMENT_SECRET_KEY
):
    raise ImproperlyConfigured(
        "PORTAL_SECRET_KEY must be set to a private value when PORTAL_DEBUG=false"
    )
SECRET_KEY = _configured_secret_key or _DEVELOPMENT_SECRET_KEY
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

LANGUAGE_CODE = "sl"
TIME_ZONE = "Europe/Ljubljana"
USE_I18N = True
USE_TZ = True

STATIC_URL = "static/"
STATIC_ROOT = BASE_DIR / "staticfiles"
DEFAULT_AUTO_FIELD = "django.db.models.BigAutoField"

# The portal and the API are same site in both environments
# (localhost:3000 -> localhost:8000, posvoji.si -> api.posvoji.si), so a Lax
# session cookie is sent with the frontend's fetch calls. Cross site requests
# are rejected by CORS, which is why the API endpoints do not carry a CSRF
# token of their own.
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

# Bearer token the ingest pipeline uses to pull the overrides. Unset means the
# export endpoint is disabled.
PORTAL_EXPORT_TOKEN = os.environ.get("PORTAL_EXPORT_TOKEN", "")

LOGGING = {
    "version": 1,
    "disable_existing_loggers": False,
    "handlers": {"console": {"class": "logging.StreamHandler"}},
    "root": {"handlers": ["console"], "level": "INFO"},
}
