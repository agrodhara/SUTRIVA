import { cleanup, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it, vi } from "vitest";

vi.mock("../../lib/api", () => ({
  ensureAnonymousSession: vi.fn(),
  requireApiBaseUrl: () => "http://127.0.0.1:8010",
  trackEvent: vi.fn(),
}));

vi.mock("../../lib/journeySession", async (importOriginal) => {
  const actual = await importOriginal<typeof import("../../lib/journeySession")>();
  return { ...actual, track11bEnabled: () => true };
});

function mockFetchOk() {
  global.fetch = vi.fn().mockResolvedValue({
    ok: true,
    json: async () => ({
      illustrative_annual_rate_percent: 14,
      debt_ratio_before: 0.25,
      debt_ratio_after: 0.53,
      breathing_room_before: 5000,
      breathing_room_after: -12089,
      estimated_new_monthly_commitment: 17089,
      total_repayment: 615197,
      total_interest: 115197,
      main_pressure: { code: "PROPOSED_EMI_REDUCES_BREATHING_ROOM", monthly_amount: 17089 },
      loan_reduction_nudge: null,
      reconciliation_note: null,
      emi_ending_note: null,
    }),
  }) as unknown as typeof fetch;
}

async function reachStep5(user: ReturnType<typeof userEvent.setup>) {
  const { BorrowJourney } = await import("./BorrowJourney");
  render(<BorrowJourney />);
  await screen.findByRole("heading", { name: "Your monthly position" });
  await user.type(screen.getByLabelText("Monthly take-home income"), "60000");
  await user.type(screen.getByLabelText("Existing loan and card payments"), "15000");
  await user.type(screen.getByLabelText("Housing"), "20000");
  await user.type(screen.getByLabelText("Household and utilities"), "10000");
  await user.type(screen.getByLabelText("Dependants and education"), "8000");
  await user.type(screen.getByLabelText("Recurring medical or insurance"), "2000");
  await user.click(screen.getByRole("radio", { name: "Usually fall short" }));
  await user.click(screen.getByRole("button", { name: "Continue" }));
  await screen.findByRole("heading", { name: "Your borrowing plan" });
  await user.type(screen.getByLabelText("Loan amount"), "500000");
  await user.selectOptions(screen.getByLabelText("Tenure"), "36");
  await user.click(screen.getByRole("button", { name: "Continue" }));
  await screen.findByRole("heading", { name: "Your Borrow Better check" });
  await user.click(screen.getByRole("button", { name: "See a connected-data example" }));
  await screen.findByRole("heading", { name: "Your figures at a glance" });
}

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
});

describe("Borrow Step 5 → pilot handoff wiring (Phase 1.1B flag on)", () => {
  it("shows a pilot entry link on Step 5, and it opens the pilot handoff for this journey", async () => {
    mockFetchOk();
    const user = userEvent.setup();
    await reachStep5(user);

    await user.click(screen.getByRole("button", { name: "See how to join the pilot" }));

    expect(await screen.findByRole("heading", { name: "Want to join the pilot?" })).toBeInTheDocument();
    expect(screen.getByText("Which commitments are putting pressure on my monthly room, and how might that change over time?")).toBeInTheDocument();
    expect(screen.queryByRole("heading", { name: "Your figures at a glance" })).not.toBeInTheDocument();
  });

  it("Finish without joining triggers a hard navigation home", async () => {
    mockFetchOk();
    const user = userEvent.setup();
    await reachStep5(user);
    await user.click(screen.getByRole("button", { name: "See how to join the pilot" }));
    await screen.findByRole("heading", { name: "Want to join the pilot?" });

    // jsdom's default test URL is already "/", so comparing href before/after proves nothing — spy on the
    // assignment itself instead.
    let assignedHref: string | undefined;
    Object.defineProperty(window, "location", {
      configurable: true,
      value: { ...window.location, set href(value: string) { assignedHref = value; } },
    });
    await user.click(screen.getByRole("button", { name: "Finish without joining" }));
    expect(assignedHref).toBe("/");
  });
});
