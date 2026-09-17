import pytest
from django.contrib.auth import get_user_model

from core.admin_accounts import PortalUserChangeForm, PortalUserCreationForm


@pytest.mark.django_db
def test_admin_cannot_create_duplicate_institutional_email(member):
    form = PortalUserCreationForm(
        data={
            "username": "second-account",
            "email": f"  {member.email.upper()}  ",
            "usable_password": "false",
        }
    )
    assert not form.is_valid()
    assert "email" in form.errors


@pytest.mark.django_db
def test_admin_cannot_change_another_user_to_existing_email(member, outsider):
    form = PortalUserChangeForm(
        instance=outsider,
        data={
            "username": outsider.username,
            "email": member.email.upper(),
            "date_joined": outsider.date_joined,
        },
    )
    assert not form.is_valid()
    assert "email" in form.errors


@pytest.mark.django_db
def test_admin_can_keep_own_email_and_create_separate_inbox(member):
    form = PortalUserChangeForm(
        instance=member,
        data={
            "username": member.username,
            "email": member.email,
            "date_joined": member.date_joined,
        },
    )
    assert form.is_valid(), form.errors
    created = PortalUserCreationForm(
        data={
            "username": "office@example.invalid",
            "email": "office@example.invalid",
            "usable_password": "false",
        }
    )
    assert created.is_valid(), created.errors
    user = created.save()
    assert user.email == "office@example.invalid"
    assert not user.has_usable_password()


@pytest.mark.django_db
def test_admin_add_page_exposes_email_and_duplicate_validation(admin_client, member):
    from django.contrib import admin

    assert admin.site._registry[get_user_model()].add_form is PortalUserCreationForm
    response = admin_client.get("/admin/auth/user/add/")
    assert response.status_code == 200
    assert 'name="email"' in response.content.decode()
