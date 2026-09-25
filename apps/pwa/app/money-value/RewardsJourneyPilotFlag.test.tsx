import { cleanup, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it, vi } from "vitest";

const { trackEventMock } = vi.hoisted(() => ({ trackEventMock: vi.fn() }));

vi.mock("../../lib/api", () => ({
  ensureAnonymousSession: vi.fn(),
  requireApiBaseUrl: () => "http://127.0.0.1:8010",
  trackEvent: trackEventMock,
}));

vi.mock("../../lib/journeySession", async (importOriginal) => {
  const actual = await importOriginal<typeof import("../../lib/journeySession")>();
  return { ...actual, track11bEnabled: () => true };
});

function mockFetchOk() {
  global.fetch = vi.fn().mockResolvedValue({
    ok: true,
    json: async () => ({
      reward_type: "cashback",
      reward_input_basis: "cashback_amount",
      reward_period: "monthly",
      reward_amount_per_period: 900,
      annual_card_fee: 4000,
      interest_input_basis: "no_balance",
      interest_value_known: true,
      estimated_annual_interest_cost: 0,
      estimated_annual_rewards: 10800,
      estimated_net_annual_value: 6800,
      reward_value_known: true,
      value_status: "POSITIVE",
      reason_codes: ["NET_VALUE_POSITIVE"],
      next_best_action: "Do this",
      guidance_disclaimer: "Indicative estimate.",
      spending_priorities: ["dining"],
      spending_fit_status: "CATEGORY_FIT_UNDETERMINED",
      main_pressure_code: "FEE_REDUCES_VALUE",
    }),
  }) as unknown as typeof fetch;
}

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
});

describe("Rewards Step 5 → pilot handoff wiring (Phase 1.1B flag on)", () => {
  it("shows a pilot entry link on Step 5, and it opens the pilot handoff for this journey", async () => {
    mockFetchOk();
    const { RewardsJourney } = await import("./RewardsJourney");
    const user = userEvent.setup();
    render(<RewardsJourney />);

    await screen.findByRole("heading", { name: "Your card behaviour" });
    await user.click(screen.getByRole("radio", { name: "Pay in full each month" }));
    await user.click(screen.getByRole("radio", { name: "Cashback" }));
    await user.click(screen.getByRole("button", { name: "Continue" }));
    await screen.findByRole("heading", { name: "Your priorities and inputs" });
    await user.click(screen.getByRole("checkbox", { name: "Dining" }));
    await user.type(screen.getByLabelText("Monthly card spend"), "25000");
    await user.type(screen.getByLabelText("Annual card fee"), "4000");
    await user.type(screen.getByLabelText("Cashback received"), "900");
    await user.selectOptions(screen.getByLabelText("Period"), "monthly");
    await user.click(screen.getByRole("button", { name: "Check my rewards" }));
    await screen.findByRole("heading", { name: "Your Rewards Check" });
    await user.click(screen.getByRole("button", { name: /See a connected-data example/ }));
    await screen.findByRole("heading", { name: "Your figures at a glance" });

    const pilotLink = screen.getByRole("button", { name: "See how to join the pilot" });
    await user.click(pilotLink);

    expect(await screen.findByRole("heading", { name: "Want to join the pilot?" })).toBeInTheDocument();
    expect(screen.getByText("Do my rewards match where I spend, or are fees and interest eating the value?")).toBeInTheDocument();
    // Step 5's own heading is gone: the pilot handoff replaces the journey frame, it doesn't stack on it.
    expect(screen.queryByRole("heading", { name: "Your figures at a glance" })).not.toBeInTheDocument();
  });

  it("Finish without joining triggers a hard navigation home, exactly like Step 5's own Back to home", async () => {
    mockFetchOk();
    const { RewardsJourney } = await import("./RewardsJourney");
    const user = userEvent.setup();
    render(<RewardsJourney />);
    await screen.findByRole("heading", { name: "Your card behaviour" });
    await user.click(screen.getByRole("radio", { name: "Pay in full each month" }));
    await user.click(screen.getByRole("radio", { name: "Cashback" }));
    await user.click(screen.getByRole("button", { name: "Continue" }));
    await screen.findByRole("heading", { name: "Your priorities and inputs" });
    await user.click(screen.getByRole("checkbox", { name: "Dining" }));
    await user.type(screen.getByLabelText("Monthly card spend"), "25000");
    await user.type(screen.getByLabelText("Annual card fee"), "4000");
    await user.type(screen.getByLabelText("Cashback received"), "900");
    await user.selectOptions(screen.getByLabelText("Period"), "monthly");
    await user.click(screen.getByRole("button", { name: "Check my rewards" }));
    await screen.findByRole("heading", { name: "Your Rewards Check" });
    await user.click(screen.getByRole("button", { name: /See a connected-data example/ }));
    await screen.findByRole("heading", { name: "Your figures at a glance" });
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
