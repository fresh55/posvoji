"""Exercise SMTP failure notices offline; never send mail from tests."""

import importlib.util
from pathlib import Path
from unittest.mock import MagicMock

import pytest

SCRIPT = Path(__file__).resolve().parents[3] / "scripts" / "notify-failure.py"
SPEC = importlib.util.spec_from_file_location("notify_failure", SCRIPT)
alerts = importlib.util.module_from_spec(SPEC)
SPEC.loader.exec_module(alerts)


@pytest.fixture
def env():
    return {
        "POSVOJI_ALERT_TO": "alerts@example.invalid",
        "PORTAL_EMAIL_HOST": "smtp.example.invalid",
        "PORTAL_EMAIL_USER": "sender@example.invalid",
        "PORTAL_EMAIL_PASSWORD": "fixture-password",
        "PORTAL_FROM_EMAIL": "sender@example.invalid",
        "PORTAL_EMAIL_USE_TLS": "true",
    }


def test_alert_encrypts_before_authentication_and_omits_secrets(monkeypatch, env):
    factory = MagicMock()
    connection = factory.return_value.__enter__.return_value
    connection.send_message.return_value = {}
    monkeypatch.setattr(alerts.smtplib, "SMTP", factory)
    alerts.notify("posvoji-health.service", env)
    assert [call[0] for call in connection.method_calls] == [
        "starttls",
        "login",
        "send_message",
    ]
    message = connection.send_message.call_args.args[0]
    assert message["To"] == env["POSVOJI_ALERT_TO"]
    assert "posvoji-health.service" in message.get_content()
    assert env["PORTAL_EMAIL_PASSWORD"] not in message.as_string()
    assert env["PORTAL_EMAIL_HOST"] not in message.get_content()


def test_refused_recipient_fails(monkeypatch, env):
    factory = MagicMock()
    factory.return_value.__enter__.return_value.send_message.return_value = {
        "alerts@example.invalid": (550, b"refused")
    }
    monkeypatch.setattr(alerts.smtplib, "SMTP", factory)
    with pytest.raises(RuntimeError, match="refused"):
        alerts.notify("posvoji-health.service", env)


def test_external_alert_links_to_run_without_exposing_configuration(monkeypatch, env):
    factory = MagicMock()
    connection = factory.return_value.__enter__.return_value
    connection.send_message.return_value = {}
    monkeypatch.setattr(alerts.smtplib, "SMTP", factory)
    alerts.notify(
        "posvoji-health.service", env | {"GITHUB_RUN_ID": "12345"}, github_actions=True
    )
    body = connection.send_message.call_args.args[0].get_content()
    assert "https://github.com/fresh55/posvoji/actions/runs/12345" in body
    assert "Systemd" not in body
    assert env["PORTAL_EMAIL_PASSWORD"] not in body


@pytest.mark.parametrize(
    "changes",
    [
        {"POSVOJI_ALERT_TO": ""},
        {"PORTAL_EMAIL_PASSWORD": ""},
        {"PORTAL_EMAIL_USE_TLS": "false"},
        {"PORTAL_EMAIL_USE_SSL": "true"},
        {"PORTAL_EMAIL_TIMEOUT": "0"},
    ],
)
def test_invalid_configuration_fails_before_connecting(monkeypatch, env, changes):
    factory = MagicMock()
    monkeypatch.setattr(alerts.smtplib, "SMTP", factory)
    with pytest.raises(ValueError):
        alerts.notify("posvoji-health.service", env | changes)
    factory.assert_not_called()


def test_test_notice_uses_implicit_tls(monkeypatch, env):
    factory = MagicMock()
    connection = factory.return_value.__enter__.return_value
    connection.send_message.return_value = {}
    monkeypatch.setattr(alerts.smtplib, "SMTP_SSL", factory)
    alerts.notify(
        "posvoji-alert-test.service",
        env
        | {
            "PORTAL_EMAIL_USE_TLS": "false",
            "PORTAL_EMAIL_USE_SSL": "true",
            "PORTAL_EMAIL_PORT": "465",
        },
    )
    connection.starttls.assert_not_called()
    assert factory.call_args.args[1] == 465
    assert "context" in factory.call_args.kwargs
    assert connection.send_message.call_args.args[0]["Subject"].startswith("[TEST]")
