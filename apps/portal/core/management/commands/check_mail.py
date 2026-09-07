"""Send one test message through the configured mail backend.

The login is a mailed link, so a portal that cannot send mail cannot let
anyone in, and the API says nothing about it: POST /api/auth/request-link
answers 204 whether the message left or not. This is how a deploy finds that
out before a shelter does.
"""

from django.conf import settings
from django.core.management.base import BaseCommand, CommandError

from core.mail import portal_message

SUBJECT = "Test: portal Posvoji.si"
BODY = (
    "To je testno sporočilo iz portala Posvoji.si.\n"
    "Če je prispelo, pošiljanje prijavnih povezav deluje.\n"
)


class Command(BaseCommand):
    help = "Send one test message through the configured mail backend"

    def add_arguments(self, parser):
        parser.add_argument(
            "--to",
            required=True,
            help="Address to send the test message to",
        )

    def handle(self, *args, **options):
        recipient = str(options["to"]).strip()
        if not recipient:
            raise CommandError("--to needs an address")

        # The same envelope the login mail travels in, which is the point of
        # the command: a message this one sends is a message that one can.
        message = portal_message(subject=SUBJECT, body=BODY, to=recipient)

        try:
            sent = message.send()
        except Exception as error:
            # Every backend has its own failure type, and the point of the
            # command is to print it rather than classify it.
            raise CommandError(f"could not send to {recipient}: {error}") from error
        if not sent:
            raise CommandError(f"the backend accepted nothing for {recipient}")

        self.stdout.write(f"sent one message to {recipient}")
        self.stdout.write(f"backend: {settings.EMAIL_BACKEND}")
        self.stdout.write(f"host: {settings.EMAIL_HOST}:{settings.EMAIL_PORT}")
