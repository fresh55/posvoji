"""Keep one user per institutional inbox in the supported admin workflow."""

from django.contrib.auth.admin import UserAdmin
from django.contrib.auth.forms import AdminUserCreationForm, UserChangeForm
from django.core.exceptions import ValidationError


class UniqueEmailMixin:
    def clean_email(self):
        email = self.cleaned_data.get("email", "").strip()
        users = self._meta.model.objects.filter(email__iexact=email)
        if self.instance.pk:
            users = users.exclude(pk=self.instance.pk)
        if email and users.exists():
            raise ValidationError(
                "This email already belongs to a user. Add the shelter membership "
                "to that user instead."
            )
        return email


class PortalUserChangeForm(UniqueEmailMixin, UserChangeForm):
    pass


class PortalUserCreationForm(UniqueEmailMixin, AdminUserCreationForm):
    class Meta(AdminUserCreationForm.Meta):
        fields = ("username", "email")


class PortalUserAdmin(UserAdmin):
    form = PortalUserChangeForm
    add_form = PortalUserCreationForm
    add_fieldsets = (
        (
            None,
            {
                "classes": ("wide",),
                "fields": (
                    "username",
                    "email",
                    "usable_password",
                    "password1",
                    "password2",
                ),
            },
        ),
    )
