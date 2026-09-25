import { requireApiBaseUrl } from "../../lib/api";

export type PilotJourney = "money_value" | "comfortable_borrowing";

export class PilotApiError extends Error {
  constructor(public code: string, public status: number) {
    super(code);
  }
}

async function postJson<T>(path: string, body: unknown): Promise<T> {
  const response = await fetch(`${requireApiBaseUrl()}${path}`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    credentials: "include",
    body: JSON.stringify(body),
  });
  if (!response.ok) {
    let code = "request_failed";
    try {
      const parsed = await response.json();
      if (typeof parsed?.detail === "string") code = parsed.detail;
    } catch {
      // response body wasn't JSON; keep the generic code
    }
    throw new PilotApiError(code, response.status);
  }
  return (await response.json()) as T;
}

/** Step 6A: anonymous interest click only. No phone number, OTP, identity or permission is sent here. */
export function postPilotInterest(journey: PilotJourney): Promise<{ pilot_registration_id: string; status: "interest_clicked" }> {
  return postJson("/v1/pilot/interest", { journey });
}

/** Step 6B start: submits the mobile number and the separate, unchecked-by-default updates choice, and
 * triggers an OTP send. */
export function postPilotMobile(
  pilotRegistrationId: string,
  phoneNumber: string,
  optionalUpdatesOptedIn: boolean,
): Promise<{ status: "otp_sent"; expires_at: string; resend_after_seconds: number }> {
  return postJson("/v1/pilot/mobile", {
    pilot_registration_id: pilotRegistrationId,
    phone_number: phoneNumber,
    optional_updates_opted_in: optionalUpdatesOptedIn,
  });
}

export function postPilotMobileResend(pilotRegistrationId: string): Promise<{ status: "otp_sent"; expires_at: string; resend_after_seconds: number }> {
  return postJson("/v1/pilot/mobile/resend", { pilot_registration_id: pilotRegistrationId });
}

/** Step 6B finish. On success, the server links the anonymous session already carried by the request
 * cookie to this registration — nothing about that linking is decided or sent from here. */
export function postPilotVerify(pilotRegistrationId: string, code: string): Promise<{ status: "verified" }> {
  return postJson("/v1/pilot/verify", { pilot_registration_id: pilotRegistrationId, code });
}
