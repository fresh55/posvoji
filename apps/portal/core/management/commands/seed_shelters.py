"""Load data/shelters.yaml into the portal.

Upserts one Shelter per registry entry and, for every entry with an
institutional address, the login and the membership that go with it. Running
it again after the registry changes is safe: nothing is duplicated and
nothing is deleted.

The ingestion mode comes from providers/<slug>/policy.yaml rather than the
registry, because that file is the one CI validates and the one the crawl
reads.
"""

from pathlib import Path

import yaml
from django.conf import settings
from django.core.management.base import BaseCommand, CommandError
from django.db import transaction

from core.accounts import ensure_user
from core.models import IngestionMode, Shelter, ShelterMembership


class Command(BaseCommand):
    help = "Upsert shelters, logins and memberships from data/shelters.yaml"

    def add_arguments(self, parser):
        parser.add_argument(
            "--path",
            default=None,
            help="Registry file to read (defaults to the repository shelters.yaml)",
        )
        parser.add_argument(
            "--providers",
            default=None,
            help="Provider directory to read (defaults to the repository providers/)",
        )

    def read_ingestion(self, providers: Path, slug: str) -> str:
        """The provider's declared ingestion mode, or the crawled default.

        A shelter with no policy file has no adapter either, so it stays on
        the default rather than becoming a manual one by accident.
        """
        path = providers / slug / "policy.yaml"
        if not path.is_file():
            return IngestionMode.SCRAPE
        try:
            document = yaml.safe_load(path.read_text(encoding="utf-8")) or {}
        except yaml.YAMLError as error:
            raise CommandError(f"invalid YAML in {path}: {error}") from error
        if not isinstance(document, dict):
            return IngestionMode.SCRAPE

        mode = str(document.get("ingestion") or "").strip()
        if mode not in IngestionMode.values:
            # CI validates every policy against the TypeScript schema, so a
            # mode this model does not know means the file is ahead of it.
            self.stderr.write(f"{path}: unknown ingestion mode {mode!r}, using scrape")
            return IngestionMode.SCRAPE
        return mode

    @transaction.atomic
    def handle(self, *args, **options):
        path = Path(options["path"] or settings.SHELTERS_YAML_PATH)
        providers = Path(options["providers"] or settings.PROVIDERS_PATH)
        try:
            document = yaml.safe_load(path.read_text(encoding="utf-8")) or {}
        except FileNotFoundError as error:
            raise CommandError(f"registry not found: {path}") from error
        except yaml.YAMLError as error:
            raise CommandError(f"invalid YAML in {path}: {error}") from error

        entries = document.get("shelters") if isinstance(document, dict) else None
        if not isinstance(entries, list):
            raise CommandError(f"{path} has no 'shelters' list")

        shelters_created = shelters_updated = 0
        users_created = memberships_created = 0
        without_email = []
        manual = []

        for entry in entries:
            if not isinstance(entry, dict):
                continue
            slug = str(entry.get("id") or "").strip()
            if not slug:
                self.stderr.write("skipping an entry without an id")
                continue

            ingestion = self.read_ingestion(providers, slug)
            if ingestion == IngestionMode.MANUAL:
                manual.append(slug)

            shelter, created = Shelter.objects.update_or_create(
                slug=slug,
                defaults={
                    "name": str(entry.get("name") or slug).strip(),
                    "city": str(entry.get("city") or "").strip(),
                    "ingestion": ingestion,
                },
            )
            if created:
                shelters_created += 1
            else:
                shelters_updated += 1

            email = str(entry.get("email") or "").strip()
            if not email:
                without_email.append(slug)
                continue

            user, user_created = ensure_user(email)
            users_created += int(user_created)
            _, membership_created = ShelterMembership.objects.get_or_create(
                user=user, shelter=shelter
            )
            memberships_created += int(membership_created)

        self.stdout.write(
            f"shelters: {shelters_created} created, {shelters_updated} updated"
        )
        self.stdout.write(
            f"logins: {users_created} created, "
            f"{memberships_created} memberships created"
        )
        if manual:
            self.stdout.write("writes its own listings: " + ", ".join(sorted(manual)))
        if without_email:
            self.stdout.write(
                "no registry email, no login: " + ", ".join(sorted(without_email))
            )
