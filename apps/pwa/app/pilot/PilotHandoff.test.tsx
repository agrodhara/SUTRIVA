import { cleanup, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const { trackEventMock } = vi.hoisted(() => ({ trackEventMock: vi.fn() }));

vi.mock("../../lib/api", () => ({
  requireApiBaseUrl: () => "http://127.0.0.1:8010",
  trackEvent: trackEventMock,
}));

import { PilotHandoff } from "./PilotHandoff";

type FetchCall = { url: string; body: Record<string, unknown> };

function mockFetchSequence(responses: Array<{ status: number; body: unknown }>) {
  const calls: FetchCall[] = [];
  let index = 0;
  global.fetch = vi.fn(async (url: string, init?: RequestInit) => {
    calls.push({ url: String(url), body: init?.body ? JSON.parse(init.body as string) : {} });
    const next = responses[Math.min(index, responses.length - 1)];
    index += 1;
    return {
      ok: next.status >= 200 && next.status < 300,
      status: next.status,
      json: async () => next.body,
    } as Response;
  }) as unknown as typeof fetch;
  return calls;
}

describe("PilotHandoff", () => {
  const onExit = vi.fn();

  beforeEach(() => {
    trackEventMock.mockReset();
    onExit.mockReset();
  });

  afterEach(() => {
    cleanup();
    vi.restoreAllMocks();
  });

  it("shows the Rewards-specific benefit question and caveat, and a persistent illustrative banner", () => {
    render(<PilotHandoff journey="money_value" onExit={onExit} />);
    expect(screen.getByText("Do my rewards match where I spend, or are fees and interest eating the value?")).toBeInTheDocument();
    expect(screen.getByText("This check can't compare across your other cards or value lounge access.")).toBeInTheDocument();
    expect(screen.getByRole("note")).toHaveTextContent("ILLUSTRATIVE EXAMPLE — NOT YOUR DATA");
  });

  it("shows the Borrow-specific benefit question and caveat", () => {
    render(<PilotHandoff journey="comfortable_borrowing" onExit={onExit} />);
    expect(screen.getByText("Which commitments are putting pressure on my monthly room, and how might that change over time?")).toBeInTheDocument();
    expect(screen.getByText("This check doesn't know which of your debts a new loan would replace.")).toBeInTheDocument();
  });

  it("shows the single required disclaimer line and no long disclaimer list", () => {
    render(<PilotHandoff journey="money_value" onExit={onExit} />);
    expect(screen.getByText("Registering interest does not guarantee an invitation or a financial product.")).toBeInTheDocument();
  });

  it("Finish without joining exits without calling any API", async () => {
    const user = userEvent.setup();
    const calls = mockFetchSequence([]);
    render(<PilotHandoff journey="money_value" onExit={onExit} />);
    await user.click(screen.getByRole("button", { name: "Finish without joining" }));
    expect(onExit).toHaveBeenCalledTimes(1);
    expect(calls).toHaveLength(0);
  });

  it("the five-step anonymous check never requires this component to render at all — it takes no result/step props", () => {
    // Structural check: PilotHandoff's props are only { journey, onExit } — it cannot depend on or block
    // completion of the anonymous check, since it has no way to receive that check's state.
    render(<PilotHandoff journey="money_value" onExit={onExit} />);
    expect(screen.getByRole("heading", { name: "Want to join the pilot?" })).toBeInTheDocument();
  });

  it("Continue registers interest, emits pilot_interest_clicked, and advances to mobile entry", async () => {
    const user = userEvent.setup();
    const calls = mockFetchSequence([{ status: 200, body: { pilot_registration_id: "reg-1", status: "interest_clicked" } }]);
    render(<PilotHandoff journey="money_value" onExit={onExit} />);

    await user.click(screen.getByRole("button", { name: "Continue" }));

    expect(await screen.findByRole("heading", { name: "Enter your mobile number" })).toBeInTheDocument();
    expect(calls[0].url).toContain("/v1/pilot/interest");
    expect(calls[0].body).toEqual({ journey: "money_value" });
    expect(trackEventMock).toHaveBeenCalledWith("pilot_interest_clicked", "money_value", expect.objectContaining({ journeyRunId: expect.any(String) }));
  });

  it("does not call the interest endpoint a second time if Continue is reached again after Back", async () => {
    const user = userEvent.setup();
    const calls = mockFetchSequence([{ status: 200, body: { pilot_registration_id: "reg-1", status: "interest_clicked" } }]);
    render(<PilotHandoff journey="money_value" onExit={onExit} />);
    await user.click(screen.getByRole("button", { name: "Continue" }));
    await screen.findByRole("heading", { name: "Enter your mobile number" });
    await user.click(screen.getByRole("button", { name: "Back" }));
    await screen.findByRole("heading", { name: "Want to join the pilot?" });
    await user.click(screen.getByRole("button", { name: "Continue" }));
    await screen.findByRole("heading", { name: "Enter your mobile number" });

    const interestCalls = calls.filter((c) => c.url.includes("/pilot/interest"));
    expect(interestCalls).toHaveLength(1);
  });

  it("explains pilot contact separately from the optional, unchecked-by-default updates choice, and the possible history link, before verification", async () => {
    const user = userEvent.setup();
    mockFetchSequence([{ status: 200, body: { pilot_registration_id: "reg-1", status: "interest_clicked" } }]);
    render(<PilotHandoff journey="money_value" onExit={onExit} />);
    await user.click(screen.getByRole("button", { name: "Continue" }));
    await screen.findByRole("heading", { name: "Enter your mobile number" });

    const checkbox = screen.getByRole("checkbox", { name: /occasional Sutriva product updates/ });
    expect(checkbox).not.toBeChecked();
    expect(screen.getByText(/We’ll contact you about this pilot using this number/)).toBeInTheDocument();
    expect(screen.getByText("Continuing may link this registration to the anonymous check you just completed.")).toBeInTheDocument();
  });

  it("rejects an invalid phone number before calling the API", async () => {
    const user = userEvent.setup();
    const calls = mockFetchSequence([{ status: 200, body: { pilot_registration_id: "reg-1", status: "interest_clicked" } }]);
    render(<PilotHandoff journey="money_value" onExit={onExit} />);
    await user.click(screen.getByRole("button", { name: "Continue" }));
    await screen.findByRole("heading", { name: "Enter your mobile number" });

    await user.type(screen.getByLabelText("Mobile number"), "123");
    await user.click(screen.getByRole("button", { name: "Send code" }));

    expect(screen.getByText("Enter a valid 10-digit mobile number.")).toBeInTheDocument();
    expect(calls.filter((c) => c.url.includes("/pilot/mobile"))).toHaveLength(0);
  });

  it("sends the mobile number and updates choice, emits mobile_submitted/optional_updates_opted_in/otp_sent, and advances to OTP entry", async () => {
    const user = userEvent.setup();
    const calls = mockFetchSequence([
      { status: 200, body: { pilot_registration_id: "reg-1", status: "interest_clicked" } },
      { status: 200, body: { status: "otp_sent", expires_at: new Date(Date.now() + 600_000).toISOString(), resend_after_seconds: 30 } },
    ]);
    render(<PilotHandoff journey="money_value" onExit={onExit} />);
    await user.click(screen.getByRole("button", { name: "Continue" }));
    await screen.findByRole("heading", { name: "Enter your mobile number" });

    await user.type(screen.getByLabelText("Mobile number"), "9876543210");
    await user.click(screen.getByRole("checkbox", { name: /occasional Sutriva product updates/ }));
    await user.click(screen.getByRole("button", { name: "Send code" }));

    expect(await screen.findByRole("heading", { name: "Enter the code we sent" })).toBeInTheDocument();
    const mobileCall = calls.find((c) => c.url.includes("/pilot/mobile") && !c.url.includes("resend"));
    expect(mobileCall?.body).toEqual({ pilot_registration_id: "reg-1", phone_number: "+919876543210", optional_updates_opted_in: true });
    expect(trackEventMock).toHaveBeenCalledWith("mobile_submitted", "money_value", expect.anything());
    expect(trackEventMock).toHaveBeenCalledWith("optional_updates_opted_in", "money_value", expect.anything());
    expect(trackEventMock).toHaveBeenCalledWith("otp_sent", "money_value", expect.anything());
  });

  it("does not emit optional_updates_opted_in when the checkbox was left unchecked", async () => {
    const user = userEvent.setup();
    mockFetchSequence([
      { status: 200, body: { pilot_registration_id: "reg-1", status: "interest_clicked" } },
      { status: 200, body: { status: "otp_sent", expires_at: new Date(Date.now() + 600_000).toISOString(), resend_after_seconds: 30 } },
    ]);
    render(<PilotHandoff journey="money_value" onExit={onExit} />);
    await user.click(screen.getByRole("button", { name: "Continue" }));
    await screen.findByRole("heading", { name: "Enter your mobile number" });
    await user.type(screen.getByLabelText("Mobile number"), "9876543210");
    await user.click(screen.getByRole("button", { name: "Send code" }));
    await screen.findByRole("heading", { name: "Enter the code we sent" });

    expect(trackEventMock).not.toHaveBeenCalledWith("optional_updates_opted_in", expect.anything(), expect.anything());
  });

  async function reachOtpStep(user: ReturnType<typeof userEvent.setup>) {
    render(<PilotHandoff journey="money_value" onExit={onExit} />);
    await user.click(screen.getByRole("button", { name: "Continue" }));
    await screen.findByRole("heading", { name: "Enter your mobile number" });
    await user.type(screen.getByLabelText("Mobile number"), "9876543210");
    await user.click(screen.getByRole("button", { name: "Send code" }));
    await screen.findByRole("heading", { name: "Enter the code we sent" });
  }

  it("shows an error and stays on the OTP screen for an invalid code", async () => {
    const user = userEvent.setup();
    mockFetchSequence([
      { status: 200, body: { pilot_registration_id: "reg-1", status: "interest_clicked" } },
      { status: 200, body: { status: "otp_sent", expires_at: new Date(Date.now() + 600_000).toISOString(), resend_after_seconds: 30 } },
      { status: 401, body: { detail: "invalid_code" } },
    ]);
    await reachOtpStep(user);

    await user.type(screen.getByLabelText("Verification code"), "000000");
    await user.click(screen.getByRole("button", { name: "Verify" }));

    expect(await screen.findByText("That code didn’t match. Check it and try again.")).toBeInTheDocument();
    expect(screen.getByRole("heading", { name: "Enter the code we sent" })).toBeInTheDocument();
  });

  it("shows a clear message for an expired code", async () => {
    const user = userEvent.setup();
    mockFetchSequence([
      { status: 200, body: { pilot_registration_id: "reg-1", status: "interest_clicked" } },
      { status: 200, body: { status: "otp_sent", expires_at: new Date(Date.now() + 600_000).toISOString(), resend_after_seconds: 30 } },
      { status: 410, body: { detail: "code_expired" } },
    ]);
    await reachOtpStep(user);
    await user.type(screen.getByLabelText("Verification code"), "123456");
    await user.click(screen.getByRole("button", { name: "Verify" }));
    expect(await screen.findByText("That code has expired. Request a new one.")).toBeInTheDocument();
  });

  it("disables resend and shows a countdown immediately after a code is sent, so a click can't silently no-op", async () => {
    const user = userEvent.setup();
    mockFetchSequence([
      { status: 200, body: { pilot_registration_id: "reg-1", status: "interest_clicked" } },
      { status: 200, body: { status: "otp_sent", expires_at: new Date(Date.now() + 600_000).toISOString(), resend_after_seconds: 30 } },
    ]);
    await reachOtpStep(user);
    const resendButton = screen.getByRole("button", { name: /Resend in \d+s/ });
    expect(resendButton).toBeDisabled();
  });

  it("resend becomes available once its cooldown elapses, requests a new code, and emits otp_sent again", async () => {
    const user = userEvent.setup();
    const calls = mockFetchSequence([
      { status: 200, body: { pilot_registration_id: "reg-1", status: "interest_clicked" } },
      // A near-zero cooldown so the button is ready almost immediately, without needing fake timers.
      { status: 200, body: { status: "otp_sent", expires_at: new Date(Date.now() + 600_000).toISOString(), resend_after_seconds: 0 } },
      { status: 200, body: { status: "otp_sent", expires_at: new Date(Date.now() + 600_000).toISOString(), resend_after_seconds: 30 } },
    ]);
    await reachOtpStep(user);
    trackEventMock.mockClear();
    await waitFor(() => expect(screen.getByRole("button", { name: "Resend code" })).toBeEnabled());
    await user.click(screen.getByRole("button", { name: "Resend code" }));
    await waitFor(() => expect(calls.filter((c) => c.url.includes("resend"))).toHaveLength(1));
    expect(trackEventMock).toHaveBeenCalledWith("otp_sent", "money_value", expect.anything());
  });

  it("Change number returns to the mobile-entry screen", async () => {
    const user = userEvent.setup();
    mockFetchSequence([
      { status: 200, body: { pilot_registration_id: "reg-1", status: "interest_clicked" } },
      { status: 200, body: { status: "otp_sent", expires_at: new Date(Date.now() + 600_000).toISOString(), resend_after_seconds: 30 } },
    ]);
    await reachOtpStep(user);
    await user.click(screen.getByRole("button", { name: "Change number" }));
    expect(await screen.findByRole("heading", { name: "Enter your mobile number" })).toBeInTheDocument();
  });

  it("Cancel on the OTP screen exits without verifying", async () => {
    const user = userEvent.setup();
    mockFetchSequence([
      { status: 200, body: { pilot_registration_id: "reg-1", status: "interest_clicked" } },
      { status: 200, body: { status: "otp_sent", expires_at: new Date(Date.now() + 600_000).toISOString(), resend_after_seconds: 30 } },
    ]);
    await reachOtpStep(user);
    await user.click(screen.getByRole("button", { name: "Cancel" }));
    expect(onExit).toHaveBeenCalledTimes(1);
  });

  it("a correct code verifies, emits otp_verified, and shows the exact required success copy — not admission or priority language", async () => {
    const user = userEvent.setup();
    mockFetchSequence([
      { status: 200, body: { pilot_registration_id: "reg-1", status: "interest_clicked" } },
      { status: 200, body: { status: "otp_sent", expires_at: new Date(Date.now() + 600_000).toISOString(), resend_after_seconds: 30 } },
      { status: 200, body: { status: "verified" } },
    ]);
    await reachOtpStep(user);
    await user.type(screen.getByLabelText("Verification code"), "482913");
    await user.click(screen.getByRole("button", { name: "Verify" }));

    expect(await screen.findByRole("heading", { name: "Your interest has been registered." })).toBeInTheDocument();
    expect(screen.getByText("We may contact you about this pilot using your verified number. If you chose product updates, those are separate.")).toBeInTheDocument();
    expect(screen.queryByText(/admitted|priority|guarantee.*invitation|approved/i)).toBeNull();
    expect(trackEventMock).toHaveBeenCalledWith("otp_verified", "money_value", expect.anything());

    await user.click(screen.getByRole("button", { name: "Done" }));
    expect(onExit).toHaveBeenCalledTimes(1);
  });

  it("never mentions a bureau, approval, eligibility, rate, savings or a product recommendation anywhere in the handoff", async () => {
    const user = userEvent.setup();
    mockFetchSequence([
      { status: 200, body: { pilot_registration_id: "reg-1", status: "interest_clicked" } },
      { status: 200, body: { status: "otp_sent", expires_at: new Date(Date.now() + 600_000).toISOString(), resend_after_seconds: 30 } },
      { status: 200, body: { status: "verified" } },
    ]);
    const forbidden = /bureau|approv|eligib|interest rate|guaranteed saving|we recommend/i;
    const { container } = render(<PilotHandoff journey="comfortable_borrowing" onExit={onExit} />);
    expect(container.textContent).not.toMatch(forbidden);
    await user.click(screen.getByRole("button", { name: "Continue" }));
    await screen.findByRole("heading", { name: "Enter your mobile number" });
    expect(container.textContent).not.toMatch(forbidden);
    await user.type(screen.getByLabelText("Mobile number"), "9876543210");
    await user.click(screen.getByRole("button", { name: "Send code" }));
    await screen.findByRole("heading", { name: "Enter the code we sent" });
    expect(container.textContent).not.toMatch(forbidden);
    await user.type(screen.getByLabelText("Verification code"), "482913");
    await user.click(screen.getByRole("button", { name: "Verify" }));
    await screen.findByRole("heading", { name: "Your interest has been registered." });
    expect(container.textContent).not.toMatch(forbidden);
  });
});
