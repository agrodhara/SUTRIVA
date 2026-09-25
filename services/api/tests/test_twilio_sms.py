from __future__ import annotations

from dataclasses import replace

import httpx
import pytest

from app.pilot_config import get_pilot_otp_settings
from app.services.sms import (
    SmsProviderNotConfiguredError,
    SmsSendRejectedError,
    TwilioSmsSender,
    get_sms_sender,
    send_or_raise,
)


def _sender(handler: httpx.MockTransport, *, ttl_seconds: int = 600) -> TwilioSmsSender:
    return TwilioSmsSender(
        account_sid="ACtest-account", api_key_sid="SKtest-key", api_key_secret="test-secret",
        messaging_service_sid="MGtest-service", ttl_seconds=ttl_seconds,
        client=httpx.Client(transport=handler),
    )


def test_twilio_sends_only_the_otp_message_and_accepts_a_queued_message() -> None:
    def respond(request: httpx.Request) -> httpx.Response:
        assert request.method == "POST"
        assert request.url.path == "/2010-04-01/Accounts/ACtest-account/Messages.json"
        assert "123456" not in str(request.url)
        assert request.headers["authorization"].startswith("Basic ")
        from urllib.parse import parse_qs

        form = parse_qs(request.content.decode("utf-8"))
        assert form == {
            "To": ["+919876543210"], "MessagingServiceSid": ["MGtest-service"],
            "Body": ["Your Sutriva verification code is 123456. It expires in 10 minutes. Do not share it."],
        }
        return httpx.Response(201, json={"sid": "SMtest-message", "status": "queued"})

    result = send_or_raise(_sender(httpx.MockTransport(respond)), phone_number="+919876543210", code="123456")
    assert result.provider == "twilio"
    assert result.accepted is True


@pytest.mark.parametrize(
    ("status_code", "response_body"),
    [
        (400, {"message": "rejected 123456"}),
        (201, {"sid": "SMtest-message", "status": "failed"}),
        (201, {"sid": "SMtest-message", "status": "undelivered"}),
        (201, {"status": "queued"}),
    ],
)
def test_twilio_rejections_never_mark_an_otp_sent_or_expose_provider_response(
    status_code: int, response_body: dict[str, str], caplog: pytest.LogCaptureFixture,
) -> None:
    sender = _sender(httpx.MockTransport(lambda request: httpx.Response(status_code, json=response_body)))
    with pytest.raises(SmsSendRejectedError):
        send_or_raise(sender, phone_number="+919876543210", code="123456")
    assert "123456" not in caplog.text
    assert "test-secret" not in caplog.text


def test_twilio_timeout_fails_closed_without_logging_code(caplog: pytest.LogCaptureFixture) -> None:
    def timeout(request: httpx.Request) -> httpx.Response:
        raise httpx.ReadTimeout("provider timeout", request=request)

    with pytest.raises(SmsSendRejectedError):
        send_or_raise(_sender(httpx.MockTransport(timeout)), phone_number="+919876543210", code="123456")
    assert "123456" not in caplog.text


def test_twilio_settings_fail_closed_without_credentials(monkeypatch: pytest.MonkeyPatch) -> None:
    settings = replace(get_pilot_otp_settings(), sms_provider="twilio")
    for name in ("TWILIO_ACCOUNT_SID", "TWILIO_API_KEY_SID", "TWILIO_API_KEY_SECRET", "TWILIO_MESSAGING_SERVICE_SID"):
        monkeypatch.delenv(name, raising=False)
    with pytest.raises(SmsProviderNotConfiguredError):
        get_sms_sender(settings)


def test_default_provider_still_fails_closed(monkeypatch: pytest.MonkeyPatch) -> None:
    monkeypatch.delenv("PILOT_SMS_PROVIDER", raising=False)
    with pytest.raises(SmsProviderNotConfiguredError):
        get_sms_sender(get_pilot_otp_settings())
