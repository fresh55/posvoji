"""Load data/shelters.yaml into the portal.

Upserts one Shelter per registry entry and, for every entry with an
institutional address, the login and the membership that go with it. Nothing
is duplicated when it runs again.

Memberships it makes carry the source "registry" and follow the registry: once
an entry names another address, or none at all, the membership for the old
address is deleted, which is what takes portal access away from it. Memberships
made by hand in /admin and by the development login are a different source and
are never touched here.

The login row itself is kept even when its last membership goes. Both
/auth/request-link and /auth/verify require a membership, so a user without one
cannot get into the portal, and keeping it preserves who edited what.

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
from core.models import IngestionMode, MembershipSource, Shelter, ShelterMembership


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

    def drop_stale_logins(self, shelter: Shelter, email: str) -> int:
        """Delete the shelter's registry logins the registry no longer names.

        The comparison is case-insensitive, the way the registry address and
        the stored one are matched everywhere else. An entry with no address
        leaves the shelter with no registry membership at all, because the one
        it had was taken out of the registry.

        Only source "registry" rows are considered. A membership made by hand
        in /admin or by the development login is not the seed's to remove.
        """
        stale = ShelterMembership.objects.filter(
            shelter=shelter, source=MembershipSource.REGISTRY
        ).select_related("user")
        if email:
            stale = stale.exclude(user__email__iexact=email)

        rows = list(stale)
        for membership in rows:
            self.stdout.write(
                f"stale registry login removed: {shelter.slug} "
                f"({membership.user.email})"
            )
        # delete() drops the select_related itself, so the queryset that was
        # just listed is also the one to delete through.
        stale.delete()
        return len(rows)

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
        users_created = memberships_created = memberships_removed = 0
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
            memberships_removed += self.drop_stale_logins(shelter, email)
            if not email:
                without_email.append(slug)
                continue

            user, user_created = ensure_user(email)
            users_created += int(user_created)
            # An existing row keeps the source it has. A registry login handed
            # over to admin control in /admin stays under it.
            _, membership_created = ShelterMembership.objects.get_or_create(
                user=user,
                shelter=shelter,
                defaults={"source": MembershipSource.REGISTRY},
            )
            memberships_created += int(membership_created)

        self.stdout.write(
            f"shelters: {shelters_created} created, {shelters_updated} updated"
        )
        self.stdout.write(
            f"logins: {users_created} created, "
            f"{memberships_created} memberships created, "
            f"{memberships_removed} stale registry memberships removed"
        )
        if manual:
            self.stdout.write("writes its own listings: " + ", ".join(sorted(manual)))
        if without_email:
            self.stdout.write(
                "no registry email, no login: " + ", ".join(sorted(without_email))
            )
