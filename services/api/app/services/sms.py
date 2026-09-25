from __future__ import annotations

import logging
from abc import ABC, abstractmethod
from dataclasses import dataclass

from app.pilot_config import PilotOtpSettings

LOGGER = logging.getLogger(__name__)


class SmsProviderNotConfiguredError(RuntimeError):
    """Raised when no real SMS provider is configured.

    This must never be caught and papered over with a fake success: the caller (the OTP service) is
    expected to let this propagate as a 503, so a misconfigured deployment fails loudly instead of
    pretending a code was delivered when nothing was sent.
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


def get_sms_sender(settings: PilotOtpSettings) -> SmsSender:
    """Returns the configured SMS transport, or raises if none is genuinely wired up.

    `PILOT_SMS_PROVIDER` is intentionally unset by default (see pilot_config.py). No branch of this
    function fabricates a working provider: a real provider (Twilio, MSG91, etc.) is a prerequisite that
    must be implemented and configured before Phase 1.1B can send a real OTP to a real person. This is the
    one prerequisite this PR does not and cannot satisfy on its own — see the PR description.
    """
    if settings.sms_provider == "logging-dev-only":
        return LoggingSmsSender()

    raise SmsProviderNotConfiguredError(
        "No SMS provider is configured (PILOT_SMS_PROVIDER is unset or unrecognized). "
        "A real provider integration (e.g. Twilio, MSG91) must be implemented and configured "
        "before Phase 1.1B OTP delivery can be enabled for real visitors."
    )
