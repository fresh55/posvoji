import pytest
from django.core import mail
from django.core.management import call_command
from django.core.management.base import CommandError

from core.api.auth import build_login_message

TO = "info@example.si"


def test_check_mail_sends_one_message():
    call_command("check_mail", "--to", TO)

    assert len(mail.outbox) == 1
    message = mail.outbox[0]
    assert message.to == [TO]
    assert message.from_email == '"Posvoji.si" <portal@posvoji.si>'
    assert message.reply_to == ["info@posvoji.si"]


def test_check_mail_fails_loudly_when_the_backend_does(monkeypatch):
    def fail_to_send(self, *args, **kwargs):
        raise RuntimeError("connection refused")

    monkeypatch.setattr("core.mail.EmailMessage.send", fail_to_send)

    with pytest.raises(CommandError, match="connection refused"):
        call_command("check_mail", "--to", TO)

    assert mail.outbox == []


def test_check_mail_fails_when_the_backend_accepts_nothing(monkeypatch):
    monkeypatch.setattr(
        "core.mail.EmailMessage.send",
        lambda self, *args, **kwargs: 0,
    )

    with pytest.raises(CommandError, match="accepted nothing"):
        call_command("check_mail", "--to", TO)


def test_check_mail_requires_a_recipient():
    with pytest.raises(CommandError):
        call_command("check_mail")


@pytest.mark.django_db
def test_check_mail_sends_the_envelope_the_login_mail_uses(member):
    """The command's whole worth is that the two cannot drift apart."""
    call_command("check_mail", "--to", TO)
    test_message = mail.outbox[0]

    login_message = build_login_message(member, None)

    assert test_message.from_email == login_message.from_email
    assert test_message.reply_to == login_message.reply_to
    assert test_message.encoding == login_message.encoding
