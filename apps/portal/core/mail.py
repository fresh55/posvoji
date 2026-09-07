"""The envelope every message the portal sends out carries.

One place, because `check_mail` exists to prove that a login mail will leave
this host, and it can only prove that if it sends the same shape the login
does. A header added here reaches both.
"""

from email.utils import formataddr

from django.conf import settings
from django.core.mail import EmailMessage


def portal_message(subject: str, body: str, to: str) -> EmailMessage:
    """A plain text message from the portal, addressed to one recipient.

    DEFAULT_FROM_EMAIL is a send-only mailbox, so the message carries a
    display name a shelter recognises and a Reply-To that a person reads.
    """
    message = EmailMessage(
        subject=subject,
        body=body,
        from_email=formataddr((settings.PORTAL_FROM_NAME, settings.DEFAULT_FROM_EMAIL)),
        to=[to],
        reply_to=[settings.PORTAL_REPLY_TO_EMAIL],
    )
    message.encoding = "utf-8"
    return message
