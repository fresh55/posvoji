from django.contrib import admin
from django.db.models import Count
from django.utils import timezone

from .conflicts import CAUGHT_UP, MOVED, Conflict, conflicts_for
from .dataset import animal_index, crawled_values
from .models import (
    COLUMN_BY_JSON_KEY,
    AnimalOverride,
    Listing,
    ListingPhoto,
    Shelter,
    ShelterMembership,
)

# The state of one override against the current crawl. Only the first three
# need a human to look at them.
ORPHAN = "orphan"
CLEAN = "clean"

STATE_LABELS = {
    MOVED: "source moved",
    CAUGHT_UP: "crawl caught up",
    ORPHAN: "no matching animal",
    CLEAN: "in step",
}


def override_state(override: AnimalOverride, animal) -> str:
    """One label for the whole row, worst state first.

    An override can hold a moved field and a caught up field at once. The
    changelist has one column, so it shows the state that needs the most
    attention.
    """
    if animal is None:
        return ORPHAN
    kinds = {conflict.kind for conflict in conflicts_for(override, animal)}
    if MOVED in kinds:
        return MOVED
    if CAUGHT_UP in kinds:
        return CAUGHT_UP
    return CLEAN


def describe(conflict: Conflict) -> str:
    if conflict.kind == CAUGHT_UP:
        return f"{conflict.field}: the crawl now also says {conflict.override!r}"
    return (
        f"{conflict.field}: the crawl said {conflict.baseline!r} when the shelter "
        f"set {conflict.override!r}, and says {conflict.crawled!r} now"
    )


@admin.register(Shelter)
class ShelterAdmin(admin.ModelAdmin):
    list_display = (
        "name",
        "slug",
        "city",
        "ingestion",
        "member_count",
        "override_count",
        "listing_count",
    )
    list_filter = ("ingestion",)
    search_fields = ("name", "slug", "city")
    ordering = ("name",)

    def get_queryset(self, request):
        return (
            super()
            .get_queryset(request)
            .annotate(
                _members=Count("memberships", distinct=True),
                _overrides=Count("animal_overrides", distinct=True),
                _listings=Count("listings", distinct=True),
            )
        )

    @admin.display(description="members", ordering="_members")
    def member_count(self, obj: Shelter) -> int:
        return obj._members

    @admin.display(description="overrides", ordering="_overrides")
    def override_count(self, obj: Shelter) -> int:
        return obj._overrides

    @admin.display(description="listings", ordering="_listings")
    def listing_count(self, obj: Shelter) -> int:
        return obj._listings


@admin.register(ShelterMembership)
class ShelterMembershipAdmin(admin.ModelAdmin):
    list_display = ("user", "user_email", "shelter", "created_at")
    list_filter = ("shelter",)
    search_fields = (
        "user__username",
        "user__email",
        "shelter__name",
        "shelter__slug",
    )
    autocomplete_fields = ("user", "shelter")

    @admin.display(description="email", ordering="user__email")
    def user_email(self, obj: ShelterMembership) -> str:
        return obj.user.email


@admin.register(Listing)
class ListingAdmin(admin.ModelAdmin):
    """Listings a manual shelter wrote here. There is no crawl to compare to.

    Archived rows stay in the changelist on purpose. They are out of the
    export and out of the API, and this is the one place left to see that a
    shelter took a listing down and when.
    """

    list_display = (
        "name",
        "shelter",
        "species",
        "status",
        "photo_count",
        "archived_at",
        "updated_at",
        "updated_by",
    )
    list_filter = ("shelter", "species", "status", "size", "energy", "sex")
    search_fields = ("id", "name", "breed", "shelter__name", "shelter__slug")
    autocomplete_fields = ("shelter", "created_by", "updated_by")
    readonly_fields = ("id", "created_at", "updated_at")
    date_hierarchy = "updated_at"

    def get_queryset(self, request):
        return (
            super()
            .get_queryset(request)
            .select_related("shelter")
            .annotate(_photos=Count("photos", distinct=True))
        )

    @admin.display(description="photos", ordering="_photos")
    def photo_count(self, obj: Listing) -> int:
        return obj._photos


@admin.register(ListingPhoto)
class ListingPhotoAdmin(admin.ModelAdmin):
    list_display = ("listing", "position", "width", "height", "created_at")
    list_filter = ("listing__shelter",)
    search_fields = (
        "listing__name",
        "listing__shelter__name",
        "listing__shelter__slug",
    )
    autocomplete_fields = ("listing",)
    readonly_fields = ("width", "height", "created_at")


class CrawlStateFilter(admin.SimpleListFilter):
    """Filters the changelist by how each override stands against the crawl.

    The crawled values live in a JSON file, not in the database, so this
    cannot be a plain field filter: the rows are resolved in Python and fed
    back to the queryset as a list of primary keys. That holds at this size,
    and the dataset is read once for the whole page.
    """

    title = "crawl state"
    parameter_name = "crawl"

    def lookups(self, request, model_admin):
        return tuple(
            (state, STATE_LABELS[state]) for state in (MOVED, CAUGHT_UP, ORPHAN, CLEAN)
        )

    def queryset(self, request, queryset):
        wanted = self.value()
        if wanted is None:
            return queryset
        index = animal_index()
        matching = [
            override.pk
            for override in queryset.select_related("shelter")
            if override_state(
                override, index.get((override.shelter.slug, override.animal_id))
            )
            == wanted
        ]
        return queryset.filter(pk__in=matching)


@admin.register(AnimalOverride)
class AnimalOverrideAdmin(admin.ModelAdmin):
    list_display = (
        "animal_id",
        "shelter",
        "name",
        "status",
        "crawl_state",
        "updated_at",
        "updated_by",
    )
    list_filter = (CrawlStateFilter, "shelter", "status", "size", "energy", "sex")
    search_fields = ("animal_id", "name", "breed", "shelter__name", "shelter__slug")
    autocomplete_fields = ("shelter", "updated_by")
    readonly_fields = ("updated_at", "baseline", "baseline_at", "crawl_report")
    date_hierarchy = "updated_at"
    actions = ("accept_the_crawl", "keep_the_correction")

    def get_queryset(self, request):
        # The crawl state of every row needs its shelter slug, so the join is
        # worth doing once instead of once per row.
        return super().get_queryset(request).select_related("shelter")

    @admin.display(description="crawl")
    def crawl_state(self, obj: AnimalOverride) -> str:
        # Called once per row. The dataset is parsed once per version of the
        # file, so this is an index build, not a re-read of animals.json.
        animal = animal_index().get((obj.shelter.slug, obj.animal_id))
        return STATE_LABELS[override_state(obj, animal)]

    @admin.display(description="crawl report")
    def crawl_report(self, obj: AnimalOverride) -> str:
        """What the crawl says about this animal now, on the change form."""
        if obj.pk is None:
            return "not saved yet"
        animal = animal_index().get((obj.shelter.slug, obj.animal_id))
        if animal is None:
            return "no matching animal in the dataset"
        conflicts = conflicts_for(obj, animal)
        if not conflicts:
            return "in step with the crawl"
        return "\n".join(describe(conflict) for conflict in conflicts)

    def _resolve_conflicts(self, request, queryset, resolve) -> int:
        """Applies one resolution to every conflicting field in the selection.

        Both actions walk the same ground: find the conflicts, decide each
        one, then record the re-taken baseline against the editor. Only the
        decision differs, so it is the only thing passed in. resolve is called
        per conflict with the override, the conflict, the crawl's current
        values and the baseline being rebuilt, and changes those in place.

        Returns the number of fields it touched.
        """
        index = animal_index()
        touched = 0
        for override in queryset.select_related("shelter"):
            animal = index.get((override.shelter.slug, override.animal_id))
            conflicts = conflicts_for(override, animal)
            # No conflicts also covers an override with no matching animal,
            # which is not something either action can resolve.
            if not conflicts:
                continue
            crawled = crawled_values(animal)
            baseline = dict(override.baseline)
            for conflict in conflicts:
                resolve(override, conflict, crawled, baseline)
            override.baseline = baseline
            # An override with nothing left in its baseline has nothing
            # recorded against the crawl, so it carries no time either.
            override.baseline_at = timezone.now() if baseline else None
            override.updated_by = request.user
            override.save()
            touched += len(conflicts)
        return touched

    @admin.action(description="Accept the crawl for conflicting fields")
    def accept_the_crawl(self, request, queryset):
        """Drops the shelter's value for every field whose source has moved.

        Only the conflicting fields are cleared. The rest of the correction is
        untouched, because nothing has happened to it.
        """

        def hand_back(override, conflict, crawled, baseline):
            setattr(override, COLUMN_BY_JSON_KEY[conflict.field], None)
            baseline.pop(conflict.field, None)

        cleared = self._resolve_conflicts(request, queryset, hand_back)
        self.message_user(request, f"{cleared} field(s) handed back to the crawl")

    @admin.action(description="Keep the correction, clear the conflict")
    def keep_the_correction(self, request, queryset):
        """Re-takes the baseline so the conflict stops being reported.

        What the site shows does not change: the correction was winning before
        and goes on winning. This records that a human has seen where the
        source moved to and still prefers the shelter's answer.
        """

        def re_take(override, conflict, crawled, baseline):
            baseline[conflict.field] = crawled[conflict.field]

        kept = self._resolve_conflicts(request, queryset, re_take)
        self.message_user(request, f"{kept} correction(s) confirmed against the crawl")
