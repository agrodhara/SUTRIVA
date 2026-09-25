from __future__ import annotations

import logging
import os
from abc import ABC, abstractmethod
from dataclasses import dataclass

import httpx

from app.pilot_config import PilotOtpSettings

LOGGER = logging.getLogger(__name__)


class SmsProviderNotConfiguredError(RuntimeError):
    """Raised when no real SMS provider is configured.

    This must never be caught and papered over with a fake success: the caller (the OTP service) is
    expected to let this propagate as a 503, so a misconfigured deployment fails loudly instead of
    pretending a code was delivered when nothing was sent.
    """


class SmsSendRejectedError(RuntimeError):
    """Raised when a configured provider was reached but declined to accept the message for delivery (an
    invalid number, a carrier rejection, an account-level block, etc.).

    Distinct from SmsProviderNotConfiguredError: the provider exists and answered, it just didn't accept
    this particular send. Like that error, this must propagate to a 503 and must never be swallowed into a
    success response or an ``otp_sent`` status — see send_or_raise below, which is the only place callers
    should invoke a sender from.
    """


@dataclass(frozen=True)
class SmsSendResult:
    provider: str
    accepted: bool


class SmsSender(ABC):
    """A real SMS transport. `send` must only return `accepted=True` if the provider actually accepted
    the message for delivery — never as a stand-in for "the code was generated"."""

    @abstractmethod
    def send(self, *, phone_number: str, code: str) -> SmsSendResult: ...


class LoggingSmsSender(SmsSender):
    """Development/test double only. Logs that a send was *attempted* and never claims delivery to a real
    handset. Selected only when `PILOT_SMS_PROVIDER=logging-dev-only`, which must never be set in a
    deployment that is reachable by real visitors — see `get_sms_sender`.
    """

    def send(self, *, phone_number: str, code: str) -> SmsSendResult:
        # Never logs the code itself: this mirrors the "no OTP value in any log" rule that applies to
        # production providers too, so switching providers later doesn't change what we've already
        # trained ourselves not to log.
        LOGGER.info("dev SMS sender: would send an OTP to a phone number ending %s (not delivered)", phone_number[-4:])
        return SmsSendResult(provider="logging-dev-only", accepted=True)


class TwilioSmsSender(SmsSender):
    """Send a Sutriva OTP via Programmable Messaging, leaving OTP verification in our API.

    Twilio's initial response only proves acceptance for processing, not handset delivery.
    Do not log the request, response body, exception or OTP: provider errors may echo message content.
    """

    def __init__(
        self, *, account_sid: str, api_key_sid: str, api_key_secret: str,
        messaging_service_sid: str, ttl_seconds: int, client: httpx.Client | None = None,
    ) -> None:
        self.account_sid = account_sid
        self.api_key_sid = api_key_sid
        self.api_key_secret = api_key_secret
        self.messaging_service_sid = messaging_service_sid
        self.ttl_minutes = max(1, (ttl_seconds + 59) // 60)
        self.client = client

    def send(self, *, phone_number: str, code: str) -> SmsSendResult:
        url = f"https://api.twilio.com/2010-04-01/Accounts/{self.account_sid}/Messages.json"
        try:
            # Passing data as form fields keeps the code out of URLs, argv and routine access logs.
            request = self.client or httpx.Client(timeout=10.0)
            try:
                response = request.post(
                    url,
                    auth=(self.api_key_sid, self.api_key_secret),
                    data={
                        "To": phone_number,
                        "MessagingServiceSid": self.messaging_service_sid,
                        "Body": f"Your Sutriva verification code is {code}. It expires in {self.ttl_minutes} minutes. Do not share it.",
                    },
                )
            finally:
                if self.client is None:
                    request.close()
            if response.status_code != 201:
                return SmsSendResult(provider="twilio", accepted=False)
            message = response.json()
            accepted = (
                isinstance(message, dict)
                and isinstance(message.get("sid"), str)
                and message["sid"].startswith(("SM", "MM"))
                and message.get("status") in {"accepted", "queued", "sending", "sent", "delivered"}
            )
            return SmsSendResult(provider="twilio", accepted=accepted)
        except (httpx.HTTPError, ValueError):
            # A timeout can be ambiguous: Twilio might have accepted the send before the reply was
            # lost. Never claim success without an accepted response or expose provider error text.
            return SmsSendResult(provider="twilio", accepted=False)


def get_sms_sender(settings: PilotOtpSettings) -> SmsSender:
    """Returns the configured SMS transport, or raises if none is genuinely wired up.

    `PILOT_SMS_PROVIDER` is intentionally unset by default (see pilot_config.py). No branch of this
    function fabricates a working provider: a real provider (Twilio, MSG91, etc.) is a prerequisite that
    must be implemented and configured before Phase 1.1B can send a real OTP to a real person. This is the
    one prerequisite this PR does not and cannot satisfy on its own — see the PR description.
    """
    if settings.sms_provider == "logging-dev-only":
        return LoggingSmsSender()

    if settings.sms_provider == "twilio":
        required = {
            "TWILIO_ACCOUNT_SID": os.getenv("TWILIO_ACCOUNT_SID", "").strip(),
            "TWILIO_API_KEY_SID": os.getenv("TWILIO_API_KEY_SID", "").strip(),
            "TWILIO_API_KEY_SECRET": os.getenv("TWILIO_API_KEY_SECRET", "").strip(),
            "TWILIO_MESSAGING_SERVICE_SID": os.getenv("TWILIO_MESSAGING_SERVICE_SID", "").strip(),
        }
        if not all(required.values()):
            raise SmsProviderNotConfiguredError("Twilio SMS provider configuration is incomplete")
        return TwilioSmsSender(
            account_sid=required["TWILIO_ACCOUNT_SID"],
            api_key_sid=required["TWILIO_API_KEY_SID"],
            api_key_secret=required["TWILIO_API_KEY_SECRET"],
            messaging_service_sid=required["TWILIO_MESSAGING_SERVICE_SID"],
            ttl_seconds=settings.code_ttl_seconds,
        )

    raise SmsProviderNotConfiguredError(
        "No SMS provider is configured (PILOT_SMS_PROVIDER is unset or unrecognized). "
        "A real provider integration (e.g. Twilio, MSG91) must be implemented and configured "
        "before Phase 1.1B OTP delivery can be enabled for real visitors."
    )


def send_or_raise(sender: SmsSender, *, phone_number: str, code: str) -> SmsSendResult:
    """The one place a sender's `send` should be invoked from.

    Checks the provider's own `accepted` result and raises SmsSendRejectedError if it is False, instead of
    letting a rejected or failed send be treated as if a code went out. Callers (app/services/pilot.py)
    must let this propagate — never marking a registration `otp_sent` or returning a success response for
    a send that was not accepted.
    """
    result = sender.send(phone_number=phone_number, code=code)
    if not result.accepted:
        LOGGER.warning("SMS provider %s declined to accept a send to a number ending %s", result.provider, phone_number[-4:])
        raise SmsSendRejectedError(f"provider {result.provider!r} rejected the send")
    return result
