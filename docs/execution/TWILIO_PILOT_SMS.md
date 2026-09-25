# Twilio SMS adapter for the Phase 1.1B pilot

This adapter uses Twilio **Programmable Messaging**, not Twilio Verify. Sutriva's
existing OTP service generates and validates the code, enforces attempts and send
limits, and records consent and anonymous-session linkage. A successful Twilio
Messages API response means that Twilio **accepted** a message for processing;
it does not prove delivery to the recipient's handset.

## Configuration (server-side only)

Set these only in the API service's secret environment, never in the PWA bundle:

- `PILOT_SMS_PROVIDER=twilio`
- `TWILIO_ACCOUNT_SID` — owning account SID
- `TWILIO_API_KEY_SID` and `TWILIO_API_KEY_SECRET` — a server-side API key pair
- `TWILIO_MESSAGING_SERVICE_SID` — a configured Messaging Service with an
  origination route that actually supports the intended Indian destinations
- `PILOT_OTP_HMAC_KEYS` — existing OTP signing key configuration

With any Twilio setting absent, the API fails closed with
`sms_provider_not_configured`. With `PILOT_SMS_PROVIDER` unset, no SMS provider is
selected. The committed `track11aEnabled` and `track11bEnabled` flags remain
false; this code does not enable 1.1B.

## Before any real send or activation

Provision the Twilio account, credentials and Messaging Service, check account
restrictions and India delivery eligibility, set a small spending ceiling, then
test with an owned phone number. Assess Twilio's published India money/loan
content restriction for Sutriva's neutral verification use case before inviting
pilot participants. Verify receipt and code confirmation; an initial API
acceptance alone does not establish delivery or carrier reliability.

Migrations 0004/0005, 1.1B enablement, consent wording, provider credentials,
and any live SMS are separate deployment decisions. The approved 1.1A canary
governance continues to prohibit 1.1B activation until explicitly changed.
