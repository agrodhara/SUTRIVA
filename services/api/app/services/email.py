from __future__ import annotations

import logging
import os
from abc import ABC, abstractmethod
from dataclasses import dataclass

LOGGER = logging.getLogger(__name__)


class EmailProviderNotConfiguredError(RuntimeError):
    """Raised when no real email provider is configured.

    Mirrors app/services/sms.py's SmsProviderNotConfiguredError byte-for-byte in intent: this must never
    be caught and papered over with a fake success. The caller is expected to let this propagate as a
    503, so a misconfigured deployment fails loudly instead of pretending a link was sent when nothing
    was.
    """


class EmailSendRejectedError(RuntimeError):
    """Raised when a configured provider was reached but declined to accept the message (an invalid
    address, a bounce-listed domain, a provider-side block, etc.). Distinct from
    EmailProviderNotConfiguredError the same way SmsSendRejectedError is distinct from
    SmsProviderNotConfiguredError — see send_or_raise, the one place a sender should be invoked from.
    """


@dataclass(frozen=True)
class EmailSendResult:
    provider: str
    accepted: bool


class EmailSender(ABC):
    """A real email transport. `send` must only return `accepted=True` if the provider actually accepted
    the message for delivery — never as a stand-in for "the link was generated"."""

    @abstractmethod
    def send(self, *, to_email: str, subject: str, body_text: str) -> EmailSendResult: ...


class LoggingEmailSender(EmailSender):
    """Development/test double only — mirrors app/services/sms.py's LoggingSmsSender exactly. Logs that a
    send was *attempted* and never claims delivery to a real inbox. Selected only when
    `SAVED_CHECK_EMAIL_PROVIDER=logging-dev-only`, which must never be set in a deployment reachable by
    real visitors — see get_email_sender.
    """

    def send(self, *, to_email: str, subject: str, body_text: str) -> EmailSendResult:
        # Never logs the address in full or the body (which contains the retrieval link): mirrors the
        # "no secret value in any log" rule already applied to OTP codes.
        local_part, _, domain = to_email.partition("@")
        masked = f"{local_part[:1]}***@{domain}" if domain else "***"
        LOGGER.info("dev email sender: would send %r to %s (not delivered)", subject, masked)
        return EmailSendResult(provider="logging-dev-only", accepted=True)


def get_email_sender() -> EmailSender:
    """Returns the configured email transport, or raises if none is genuinely wired up.

    No real provider (SES, Postmark, etc.) is implemented yet — see
    docs/product/journeys/B1_SAVED_CHECK_SPEC.md's Authentication options / Implementation estimate
    sections. This function's job, like app/services/sms.py::get_sms_sender, is only to ever return a
    sender that actually works or to fail closed; it must never fabricate one.
    """
    provider = os.getenv("SAVED_CHECK_EMAIL_PROVIDER", "").strip()

    if provider == "logging-dev-only":
        return LoggingEmailSender()

    if provider:
        raise EmailProviderNotConfiguredError(
            f"SAVED_CHECK_EMAIL_PROVIDER={provider!r} is not a provider this codebase implements yet. "
            "A real provider integration (e.g. AWS SES) must be built and configured before the saved-"
            "check feature can email a real visitor — see B1_SAVED_CHECK_SPEC.md."
        )

    raise EmailProviderNotConfiguredError(
        "No email provider is configured (SAVED_CHECK_EMAIL_PROVIDER is unset). A real provider "
        "integration must be implemented and configured before saved-check emails can be sent to real "
        "visitors."
    )


def send_or_raise(sender: EmailSender, *, to_email: str, subject: str, body_text: str) -> EmailSendResult:
    """The one place a sender's `send` should be invoked from — mirrors app/services/sms.py::send_or_raise.

    Raises EmailSendRejectedError if the provider declined the send, instead of letting a rejected or
    failed send be treated as if the link went out. Callers must let this propagate — never persisting a
    saved check or returning a success response for a send that was not accepted.
    """
    result = sender.send(to_email=to_email, subject=subject, body_text=body_text)
    if not result.accepted:
        LOGGER.warning("email provider %s declined to accept a send", result.provider)
        raise EmailSendRejectedError(f"provider {result.provider!r} rejected the send")
    return result
