import { cleanup, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const { ensureAnonymousSessionMock, trackEventMock, track11aEnabledMock, track11bEnabledMock } = vi.hoisted(() => ({
  ensureAnonymousSessionMock: vi.fn(),
  trackEventMock: vi.fn(),
  track11aEnabledMock: vi.fn(() => true),
  track11bEnabledMock: vi.fn(() => true),
}));

vi.mock("../../lib/api", () => ({
  ensureAnonymousSession: ensureAnonymousSessionMock,
  requireApiBaseUrl: () => "http://127.0.0.1:8010",
  trackEvent: trackEventMock,
}));

vi.mock("../../lib/journeySession", async () => {
  const actual = await vi.importActual<typeof import("../../lib/journeySession")>("../../lib/journeySession");
  return {
    ...actual,
    track11aEnabled: track11aEnabledMock,
    track11bEnabled: track11bEnabledMock,
  };
});

async function renderMoneyValuePage() {
  const pageModule = await import("./page");
  render(<pageModule.default />);
}

describe("MoneyValuePage reward selection", () => {
  beforeEach(() => {
    ensureAnonymousSessionMock.mockReset();
    ensureAnonymousSessionMock.mockResolvedValue(undefined);
    trackEventMock.mockReset();
    track11aEnabledMock.mockReset();
    track11bEnabledMock.mockReset();
    track11aEnabledMock.mockReturnValue(true);
    track11bEnabledMock.mockReturnValue(true);
    window.sessionStorage.clear();
    global.fetch = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({
        estimated_annual_rewards: 10800,
        annual_card_fee: 4000,
        estimated_annual_interest_cost: 0,
        estimated_net_annual_value: 6800,
        reward_value_known: true,
        interest_value_known: true,
        reward_input_basis: "cashback_amount",
        reward_period: "monthly",
        interest_input_basis: "no_balance",
        value_status: "POSITIVE",
        reason_codes: ["NET_VALUE_POSITIVE"],
        next_best_action: "Keep monitoring.",
      }),
    }) as unknown as typeof fetch;
  });

  afterEach(() => {
    cleanup();
    vi.restoreAllMocks();
  });

  it("keeps reward type selection and relevant fields aligned for 20 complete sequences", async () => {
    for (let run = 0; run < 20; run += 1) {
      const user = userEvent.setup();
      await renderMoneyValuePage();

      await waitFor(() => expect(screen.getByRole("button", { name: "Cashback" })).toBeEnabled());

      const cashback = screen.getByRole("button", { name: "Cashback" });
      const points = screen.getByRole("button", { name: "Points" });
      const miles = screen.getByRole("button", { name: "Miles" });
      const notSure = screen.getByRole("button", { name: "I'm not sure" });

      await user.click(cashback);
      expect(cashback.className).toContain("isSelected");
      expect(points.className).not.toContain("isSelected");
      expect(screen.getByLabelText("How much cashback did you receive?")).toBeInTheDocument();

      await user.click(points);
      expect(points.className).toContain("isSelected");
      expect(cashback.className).not.toContain("isSelected");
      expect(screen.getByLabelText("Do you know the approximate cash value of the rewards you earned in this period?")).toBeInTheDocument();
      expect(screen.queryByLabelText("How much cashback did you receive?")).not.toBeInTheDocument();

      await user.click(miles);
      expect(miles.className).toContain("isSelected");
      expect(points.className).not.toContain("isSelected");
      expect(screen.getByLabelText("Do you know the approximate cash value of the rewards you earned in this period?")).toBeInTheDocument();

      await user.click(notSure);
      expect(notSure.className).toContain("isSelected");
      expect(miles.className).not.toContain("isSelected");
      expect(screen.queryByLabelText("Do you know the approximate cash value of the rewards you earned in this period?")).not.toBeInTheDocument();

      cleanup();
    }
  });

  it("shows the baseline I'm not sure option in all four flag combinations", async () => {
    const states: Array<[boolean, boolean]> = [
      [false, false],
      [true, false],
      [true, true],
      [false, true],
    ];

    for (const [aEnabled, bEnabled] of states) {
      track11aEnabledMock.mockReturnValue(aEnabled);
      track11bEnabledMock.mockReturnValue(bEnabled);

      await renderMoneyValuePage();
      await waitFor(() => expect(screen.getByRole("button", { name: "Cashback" })).toBeEnabled());
      expect(screen.getByRole("button", { name: "I'm not sure" })).toBeInTheDocument();
      cleanup();
    }
  });

  it("uses the correct balance selector label and conditional balance fields", async () => {
    const user = userEvent.setup();
    await renderMoneyValuePage();

    await waitFor(() => expect(screen.getByRole("button", { name: "Check my money value" })).toBeEnabled());

    const interestBasis = screen.getByLabelText("Do you carry a balance forward?");
    expect(interestBasis).toBeInTheDocument();

    await user.selectOptions(interestBasis, "known");
    expect(screen.getByLabelText("Balance carried forward")).toBeInTheDocument();
    expect(screen.getByLabelText("Annual interest rate (%)")).toBeInTheDocument();

    await user.selectOptions(interestBasis, "unknown");
    expect(screen.queryByLabelText("Balance carried forward")).not.toBeInTheDocument();
    expect(screen.queryByLabelText("Annual interest rate (%)")).not.toBeInTheDocument();

    await user.selectOptions(interestBasis, "no_balance");
    expect(screen.queryByLabelText("Balance carried forward")).not.toBeInTheDocument();
    expect(screen.queryByLabelText("Annual interest rate (%)")).not.toBeInTheDocument();
  });

  it("keeps previous result and supports retry after a deterministic what-if failure", async () => {
    global.fetch = vi
      .fn()
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          estimated_annual_rewards: 10800,
          annual_card_fee: 4000,
          estimated_annual_interest_cost: 0,
          estimated_net_annual_value: 6800,
          reward_value_known: true,
          interest_value_known: true,
          reward_input_basis: "cashback_amount",
          reward_period: "monthly",
          interest_input_basis: "no_balance",
          value_status: "POSITIVE",
          reason_codes: ["NET_VALUE_POSITIVE"],
          next_best_action: "Keep monitoring.",
        }),
      })
      .mockResolvedValueOnce({ ok: false, json: async () => ({}) })
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          estimated_annual_rewards: 10800,
          annual_card_fee: 4500,
          estimated_annual_interest_cost: 0,
          estimated_net_annual_value: 6300,
          reward_value_known: true,
          interest_value_known: true,
          reward_input_basis: "cashback_amount",
          reward_period: "monthly",
          interest_input_basis: "no_balance",
          value_status: "POSITIVE",
          reason_codes: ["NET_VALUE_POSITIVE"],
          next_best_action: "Keep monitoring.",
        }),
      }) as unknown as typeof fetch;

    const user = userEvent.setup();
    await renderMoneyValuePage();

    await waitFor(() => expect(screen.getByRole("button", { name: "Check my money value" })).toBeEnabled());
    await user.type(screen.getByLabelText("Monthly card spend"), "75000");
    await user.type(screen.getByLabelText("Annual card fee"), "4000");
    await user.type(screen.getByLabelText("How much cashback did you receive?"), "900");

    await user.click(screen.getByRole("button", { name: "Check my money value" }));
    await screen.findByRole("heading", { name: "Your money value check" });
    expect(screen.getByText("₹6,800")).toBeInTheDocument();

    const annualFeeInput = screen.getByLabelText("Annual card fee");
    await user.clear(annualFeeInput);
    await user.type(annualFeeInput, "4500");
    expect(annualFeeInput).toHaveValue("₹ 4,500");

    await user.click(screen.getByRole("button", { name: "Update estimate" }));

    const expectedError = "We couldn’t update your estimate. Your previous result is still shown. Please try again.";
    await screen.findByText(expectedError);
    expect(screen.queryByText("Failed to fetch")).not.toBeInTheDocument();
    expect(screen.getByText("₹6,800")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "See what I could check next" })).toBeDisabled();
    expect(global.fetch).toHaveBeenCalledTimes(2);
    const emittedAfterFailure = trackEventMock.mock.calls.map(([eventType]) => eventType);
    expect(emittedAfterFailure.indexOf("result_requested")).toBeGreaterThan(-1);
    expect(emittedAfterFailure.indexOf("result_failed")).toBeGreaterThan(emittedAfterFailure.indexOf("result_requested"));

    await user.click(screen.getByRole("button", { name: "Try again" }));

    await waitFor(() => {
      expect(global.fetch).toHaveBeenCalledTimes(3);
      expect(screen.queryByText(expectedError)).not.toBeInTheDocument();
      expect(screen.getByText("₹6,300")).toBeInTheDocument();
      expect(screen.getByRole("button", { name: "See what I could check next" })).toBeEnabled();
    });
  });

  it("shows annualized reward quantity without rupee conversion when points value is unknown", async () => {
    global.fetch = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({
        estimated_annual_rewards: null,
        annualized_reward_units: 4000,
        annual_card_fee: 4000,
        estimated_annual_interest_cost: 0,
        estimated_net_annual_value: null,
        reward_value_known: false,
        interest_value_known: true,
        reward_input_basis: "earned_units",
        reward_period: "quarterly",
        interest_input_basis: "no_balance",
        unknown_value_reason: "REWARD_VALUE_UNKNOWN",
        value_status: "UNKNOWN_VALUE",
        reason_codes: ["REWARD_VALUE_UNKNOWN"],
        next_best_action: "Add your reward details when you can so this estimate can calculate card value more reliably.",
      }),
    }) as unknown as typeof fetch;

    const user = userEvent.setup();
    await renderMoneyValuePage();

    await waitFor(() => expect(screen.getByRole("button", { name: "Check my money value" })).toBeEnabled());
    await user.type(screen.getByLabelText("Monthly card spend"), "60000");
    await user.type(screen.getByLabelText("Annual card fee"), "4000");
    await user.click(screen.getByRole("button", { name: "Points" }));
    await user.selectOptions(screen.getByLabelText("Do you know the approximate cash value of the rewards you earned in this period?"), "unknown");
    await user.type(screen.getByLabelText("Points or miles earned in this period"), "1000");
    await user.selectOptions(screen.getByLabelText("Reward period"), "quarterly");

    await user.click(screen.getByRole("button", { name: "Check my money value" }));

    await screen.findByRole("heading", { name: "Your money value check" });
    expect(screen.getByText("Annualized rewards quantity: 4000")).toBeInTheDocument();
    expect(screen.queryByText("Estimated net annual value")).not.toBeInTheDocument();
  });

  it("emits mandatory reward events for real actions with result ordering", async () => {
    const user = userEvent.setup();
    await renderMoneyValuePage();

    await waitFor(() => expect(screen.getByRole("button", { name: "Check my money value" })).toBeEnabled());

    await user.click(screen.getByRole("button", { name: "Cashback" }));
    await user.selectOptions(screen.getByLabelText("Do you carry a balance forward?"), "known");
    await user.click(screen.getByRole("button", { name: "Open reward finder" }));
    await user.click(screen.getByRole("button", { name: "I found my cashback amount" }));
    await user.click(screen.getByRole("button", { name: "I only know points or miles quantity" }));
    await user.click(screen.getByRole("button", { name: "I still can't estimate rewards" }));

    await user.type(screen.getByLabelText("Monthly card spend"), "75000");
    await user.type(screen.getByLabelText("Annual card fee"), "4000");
    await user.click(screen.getByRole("button", { name: "Use example values" }));
    await user.click(screen.getByRole("button", { name: "Check my money value" }));

    await screen.findByRole("heading", { name: "Your money value check" });
    await user.click(screen.getByRole("button", { name: "See what I could check next" }));
    await user.click(screen.getByRole("button", { name: "See what I could check next" }));
    await screen.findByRole("heading", { name: "What would be most useful next?" });
    await user.click(screen.getByRole("button", { name: /Understand my rewards and costs/ }));
    await screen.findByRole("heading", { name: "Here's what you could check next" });
    await user.click(screen.getByRole("button", { name: "I'd use this when available" }));

    await screen.findByRole("heading", { name: "Thanks for letting us know" });
    await user.click(screen.getByRole("button", { name: "← Back to estimate details" }));
    await user.click(screen.getByRole("button", { name: "Check another card" }));

    const emitted = trackEventMock.mock.calls.map(([eventType]) => eventType);
    for (const expectedEvent of [
      "journey_started",
      "step_viewed",
      "step_completed",
      "result_requested",
      "result_viewed",
      "result_action_selected",
      "illustrative_example_viewed",
      "check_another_selected",
      "journey_completed",
      "balance_behavior_selected",
      "reward_type_selected",
      "reward_help_opened",
      "reward_help_outcome_selected",
      "reward_result_state_viewed",
      "pilot_cta_selected",
    ]) {
      expect(emitted).toContain(expectedEvent);
    }

    const requestedIndex = emitted.indexOf("result_requested");
    const viewedIndex = emitted.indexOf("result_viewed");
    expect(requestedIndex).toBeGreaterThan(-1);
    expect(viewedIndex).toBeGreaterThan(requestedIndex);
  });

  it("increments card check number on check another card and preserves session", async () => {
    const user = userEvent.setup();
    await renderMoneyValuePage();

    await waitFor(() => expect(screen.getByRole("button", { name: "Check my money value" })).toBeEnabled());
    await user.click(screen.getByRole("button", { name: "Use example values" }));
    await user.click(screen.getByRole("button", { name: "Check my money value" }));
    await screen.findByRole("heading", { name: "Your money value check" });

    await user.click(screen.getByRole("button", { name: "Check another card" }));

    const checkAnotherCall = trackEventMock.mock.calls.find(([eventType]) => eventType === "check_another_selected");
    expect(checkAnotherCall?.[2]?.cardCheckNumber).toBe(1);

    await waitFor(() => {
      const startedCalls = trackEventMock.mock.calls.filter(([eventType]) => eventType === "journey_started");
      expect(startedCalls.length).toBeGreaterThan(1);
      expect(startedCalls.at(-1)?.[2]?.cardCheckNumber).toBe(2);
    });
  });

  it("rolls back to Track 1.0 experience when both flags are false", async () => {
    track11aEnabledMock.mockReturnValue(false);
    track11bEnabledMock.mockReturnValue(false);

    const user = userEvent.setup();
    await renderMoneyValuePage();

    await waitFor(() => expect(screen.getByRole("button", { name: "Check my money value" })).toBeEnabled());
    await user.click(screen.getByRole("button", { name: "Use example values" }));
    await user.click(screen.getByRole("button", { name: "Check my money value" }));

    await screen.findByRole("heading", { name: "Your money value check" });
    expect(screen.queryByRole("button", { name: "See what I could check next" })).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Open reward finder" })).not.toBeInTheDocument();

    const emitted = trackEventMock.mock.calls.map(([eventType]) => eventType);
    expect(emitted).toContain("check_started");
    expect(emitted).toContain("check_completed");
    expect(emitted).not.toContain("journey_started");
    expect(emitted).not.toContain("step_viewed");
    expect(emitted).not.toContain("result_requested");
    expect(emitted).not.toContain("reward_type_selected");
    expect(emitted).not.toContain("balance_behavior_selected");
  });

  it("shows 1.1A journey but hides continuation when 1.1A=true and 1.1B=false", async () => {
    track11aEnabledMock.mockReturnValue(true);
    track11bEnabledMock.mockReturnValue(false);

    const user = userEvent.setup();
    await renderMoneyValuePage();

    await waitFor(() => expect(screen.getByRole("button", { name: "Check my money value" })).toBeEnabled());
    expect(screen.getByRole("button", { name: "Open reward finder" })).toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: "Use example values" }));
    await user.click(screen.getByRole("button", { name: "Check my money value" }));
    await screen.findByRole("heading", { name: "Your money value check" });

    expect(screen.queryByRole("button", { name: "See what I could check next" })).not.toBeInTheDocument();
    const emitted = trackEventMock.mock.calls.map(([eventType]) => eventType);
    expect(emitted).not.toContain("result_action_selected");
    expect(emitted).not.toContain("teaser_viewed");
  });

  it("safe-disables 1.1B surface when 1.1A=false and 1.1B=true", async () => {
    track11aEnabledMock.mockReturnValue(false);
    track11bEnabledMock.mockReturnValue(true);

    const user = userEvent.setup();
    await renderMoneyValuePage();

    await waitFor(() => expect(screen.getByRole("button", { name: "Check my money value" })).toBeEnabled());
    expect(screen.queryByRole("button", { name: "Open reward finder" })).not.toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: "Use example values" }));
    await user.click(screen.getByRole("button", { name: "Check my money value" }));
    await screen.findByRole("heading", { name: "Your money value check" });

    expect(screen.queryByRole("button", { name: "See what I could check next" })).not.toBeInTheDocument();
    const emitted = trackEventMock.mock.calls.map(([eventType]) => eventType);
    expect(emitted).not.toContain("journey_started");
    expect(emitted).not.toContain("result_action_selected");
  });
});