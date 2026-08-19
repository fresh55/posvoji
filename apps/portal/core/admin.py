from django.contrib import admin
from django.db.models import Count
from django.utils import timezone

from .conflicts import CAUGHT_UP, MOVED, Conflict, conflicts_for
from .dataset import animal_index, crawled_values
from .models import COLUMN_BY_JSON_KEY, AnimalOverride, Shelter, ShelterMembership

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
    list_display = ("name", "slug", "city", "member_count", "override_count")
    search_fields = ("name", "slug", "city")
    ordering = ("name",)

    def get_queryset(self, request):
        return (
            super()
            .get_queryset(request)
            .annotate(
                _members=Count("memberships", distinct=True),
                _overrides=Count("animal_overrides", distinct=True),
            )
        )

    @admin.display(description="members", ordering="_members")
    def member_count(self, obj: Shelter) -> int:
        return obj._members

    @admin.display(description="overrides", ordering="_overrides")
    def override_count(self, obj: Shelter) -> int:
        return obj._overrides


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

    # Set for the duration of one changelist render, see changelist_view.
    _index = None

    def get_queryset(self, request):
        # The crawl state of every row needs its shelter slug, so the join is
        # worth doing once instead of once per row.
        return super().get_queryset(request).select_related("shelter")

    def changelist_view(self, request, extra_context=None):
        # crawl_state is called per row and is handed only the row, so the
        # dataset for this page is read here and kept on the admin instance.
        self._index = animal_index()
        try:
            return super().changelist_view(request, extra_context)
        finally:
            self._index = None

    @admin.display(description="crawl")
    def crawl_state(self, obj: AnimalOverride) -> str:
        index = self._index if self._index is not None else animal_index()
        animal = index.get((obj.shelter.slug, obj.animal_id))
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

    @admin.action(description="Accept the crawl for conflicting fields")
    def accept_the_crawl(self, request, queryset):
        """Drops the shelter's value for every field whose source has moved.

        Only the conflicting fields are cleared. The rest of the correction is
        untouched, because nothing has happened to it.
        """
        index = animal_index()
        cleared = 0
        for override in queryset.select_related("shelter"):
            animal = index.get((override.shelter.slug, override.animal_id))
            conflicts = conflicts_for(override, animal)
            if not conflicts:
                continue
            baseline = dict(override.baseline)
            for conflict in conflicts:
                setattr(override, COLUMN_BY_JSON_KEY[conflict.field], None)
                baseline.pop(conflict.field, None)
            override.baseline = baseline
            override.baseline_at = timezone.now() if baseline else None
            override.updated_by = request.user
            override.save()
            cleared += len(conflicts)
        self.message_user(request, f"{cleared} field(s) handed back to the crawl")

    @admin.action(description="Keep the correction, clear the conflict")
    def keep_the_correction(self, request, queryset):
        """Re-takes the baseline so the conflict stops being reported.

        What the site shows does not change: the correction was winning before
        and goes on winning. This records that a human has seen where the
        source moved to and still prefers the shelter's answer.
        """
        index = animal_index()
        kept = 0
        for override in queryset.select_related("shelter"):
            animal = index.get((override.shelter.slug, override.animal_id))
            conflicts = conflicts_for(override, animal)
            if not conflicts:
                continue
            crawled = crawled_values(animal)
            baseline = dict(override.baseline)
            for conflict in conflicts:
                baseline[conflict.field] = crawled[conflict.field]
            override.baseline = baseline
            override.baseline_at = timezone.now()
            override.updated_by = request.user
            override.save()
            kept += len(conflicts)
        self.message_user(request, f"{kept} correction(s) confirmed against the crawl")
