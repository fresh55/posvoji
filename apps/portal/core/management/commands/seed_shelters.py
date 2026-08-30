"""Load data/shelters.yaml into the portal.

Upserts one Shelter per registry entry and, for every entry with an
institutional address, the login and the membership that go with it. Running
it again after the registry changes is safe: nothing is duplicated and
nothing is deleted.
"""

from pathlib import Path

import yaml
from django.conf import settings
from django.core.management.base import BaseCommand, CommandError
from django.db import transaction

from core.accounts import ensure_user
from core.models import Shelter, ShelterMembership


class Command(BaseCommand):
    help = "Upsert shelters, logins and memberships from data/shelters.yaml"

    def add_arguments(self, parser):
        parser.add_argument(
            "--path",
            default=None,
            help="Registry file to read (defaults to the repository shelters.yaml)",
        )

    @transaction.atomic
    def handle(self, *args, **options):
        path = Path(options["path"] or settings.SHELTERS_YAML_PATH)
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

        for entry in entries:
            if not isinstance(entry, dict):
                continue
            slug = str(entry.get("id") or "").strip()
            if not slug:
                self.stderr.write("skipping an entry without an id")
                continue

            shelter, created = Shelter.objects.update_or_create(
                slug=slug,
                defaults={
                    "name": str(entry.get("name") or slug).strip(),
                    "city": str(entry.get("city") or "").strip(),
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
        if without_email:
            self.stdout.write(
                "no registry email, no login: " + ", ".join(sorted(without_email))
            )
