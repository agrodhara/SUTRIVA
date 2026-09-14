import { cleanup, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import MoneyValuePage from "./page";

const { trackEventMock } = vi.hoisted(() => ({ trackEventMock: vi.fn() }));

vi.mock("../../lib/api", () => ({
  requireApiBaseUrl: () => "http://127.0.0.1:8010",
  trackEvent: trackEventMock,
}));

describe("MoneyValuePage reward selection", () => {
  beforeEach(() => {
    trackEventMock.mockReset();
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
      render(<MoneyValuePage />);

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

  it("uses the correct balance selector label and conditional balance fields", async () => {
    const user = userEvent.setup();
    render(<MoneyValuePage />);

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
    render(<MoneyValuePage />);

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
    expect(screen.getByText("₹6,800")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "See what I could check next" })).toBeDisabled();
    expect(global.fetch).toHaveBeenCalledTimes(2);

    await user.click(screen.getByRole("button", { name: "Try again" }));

    await waitFor(() => {
      expect(global.fetch).toHaveBeenCalledTimes(3);
      expect(screen.queryByText(expectedError)).not.toBeInTheDocument();
      expect(screen.getByText("₹6,300")).toBeInTheDocument();
      expect(screen.getByRole("button", { name: "See what I could check next" })).toBeEnabled();
    });
  });
});