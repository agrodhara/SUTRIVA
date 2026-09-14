import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import BorrowBetterPage from "./page";
import { buildBorrowBetterPayload } from "./formState";

const { trackEventMock } = vi.hoisted(() => ({ trackEventMock: vi.fn() }));

vi.mock("../../lib/api", () => ({
  requireApiBaseUrl: () => "http://127.0.0.1:8010",
  trackEvent: trackEventMock,
}));

describe("BorrowBetterPage", () => {
  beforeEach(() => {
    trackEventMock.mockReset();
    global.fetch = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({
        comfort_status: "CAUTION",
        estimated_new_monthly_commitment: 17122,
        total_monthly_commitment: 42122,
        commitment_ratio: 0.4212,
        reason_codes: ["COMMITMENT_RATIO_CAUTION"],
        next_best_action: "Review amount and tenure.",
      }),
    }) as unknown as typeof fetch;
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("builds the visible non-zero payload for click submit", async () => {
    const user = userEvent.setup();
    render(<BorrowBetterPage />);

    await waitFor(() => expect(screen.getByRole("button", { name: "Check borrowing comfort" })).toBeEnabled());

    await user.type(screen.getByLabelText("Monthly income"), "100000");
    await user.type(screen.getByLabelText("Existing monthly commitments"), "25000");
    await user.type(screen.getByLabelText("Desired borrowing amount"), "500000");
    await user.type(screen.getByLabelText("Desired tenure (months)"), "36");

    expect(screen.getByLabelText("Monthly income")).toHaveValue(100000);
    expect(screen.getByLabelText("Existing monthly commitments")).toHaveValue(25000);
    expect(screen.getByLabelText("Desired borrowing amount")).toHaveValue(500000);
    expect(screen.getByLabelText("Desired tenure (months)")).toHaveValue(36);

    await user.click(screen.getByRole("button", { name: "Check borrowing comfort" }));

    await waitFor(() => expect(global.fetch).toHaveBeenCalled());
    expect(global.fetch).toHaveBeenCalledWith(
      "http://127.0.0.1:8010/v1/borrowing-intelligence/comfortable-borrowing-check",
      expect.objectContaining({
        method: "POST",
        body: JSON.stringify({
          monthly_income: 100000,
          existing_monthly_commitments: 25000,
          desired_borrowing_amount: 500000,
          desired_tenure_months: 36,
        }),
      }),
    );
  });

  it("submits the same payload with Enter as with click", async () => {
    const user = userEvent.setup();
    render(<BorrowBetterPage />);

    await waitFor(() => expect(screen.getByRole("button", { name: "Check borrowing comfort" })).toBeEnabled());

    await user.type(screen.getByLabelText("Monthly income"), "100000");
    await user.type(screen.getByLabelText("Existing monthly commitments"), "25000");
    await user.type(screen.getByLabelText("Desired borrowing amount"), "500000");
    await user.type(screen.getByLabelText("Desired tenure (months)"), "36{Enter}");

    await waitFor(() => expect(global.fetch).toHaveBeenCalled());

    const fetchCalls = vi.mocked(global.fetch).mock.calls;
    expect(fetchCalls[0]?.[1]).toEqual(expect.objectContaining({
      body: JSON.stringify({
        monthly_income: 100000,
        existing_monthly_commitments: 25000,
        desired_borrowing_amount: 500000,
        desired_tenure_months: 36,
      }),
    }));
  });

  it("keeps payload builder aligned with the visible form state", () => {
    expect(buildBorrowBetterPayload({
      monthly_income: "100000",
      existing_monthly_commitments: "25000",
      desired_borrowing_amount: "500000",
      desired_tenure_months: "36",
    })).toEqual({
      monthly_income: 100000,
      existing_monthly_commitments: 25000,
      desired_borrowing_amount: 500000,
      desired_tenure_months: 36,
    });
  });

  it("keeps previous result and supports retry after a deterministic what-if failure", async () => {
    global.fetch = vi
      .fn()
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          comfort_status: "CAUTION",
          estimated_new_monthly_commitment: 17122,
          total_monthly_commitment: 42122,
          commitment_ratio: 0.4212,
          reason_codes: ["COMMITMENT_RATIO_CAUTION"],
          next_best_action: "Review amount and tenure.",
        }),
      })
      .mockResolvedValueOnce({ ok: false, json: async () => ({}) })
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          comfort_status: "CAUTION",
          estimated_new_monthly_commitment: 18500,
          total_monthly_commitment: 43500,
          commitment_ratio: 0.435,
          reason_codes: ["COMMITMENT_RATIO_CAUTION"],
          next_best_action: "Review amount and tenure.",
        }),
      }) as unknown as typeof fetch;

    const user = userEvent.setup();
    render(<BorrowBetterPage />);

    await waitFor(() => expect(screen.getByRole("button", { name: "Check borrowing comfort" })).toBeEnabled());

    await user.type(screen.getByLabelText("Monthly income"), "100000");
    await user.type(screen.getByLabelText("Existing monthly commitments"), "25000");
    await user.type(screen.getByLabelText("Desired borrowing amount"), "500000");
    await user.type(screen.getByLabelText("Desired tenure (months)"), "36");
    await user.click(screen.getByRole("button", { name: "Check borrowing comfort" }));

    await screen.findByRole("heading", { name: "Your borrowing comfort check" });
    expect(screen.getByText("₹17,122")).toBeInTheDocument();

    const whatIfAmount = screen.getAllByRole("spinbutton")[0] as HTMLInputElement;
    await user.clear(whatIfAmount);
    await user.type(whatIfAmount, "500001");
    expect(whatIfAmount).toHaveValue(500001);

    await user.click(screen.getByRole("button", { name: "Update estimate" }));

    const expectedError = "We couldn’t update your estimate. Your previous result is still shown. Please try again.";
    await screen.findByText(expectedError);
    expect(screen.getByText("₹17,122")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "See what I could check next" })).toBeDisabled();
    expect(global.fetch).toHaveBeenCalledTimes(2);

    await user.click(screen.getByRole("button", { name: "Try again" }));

    await waitFor(() => {
      expect(global.fetch).toHaveBeenCalledTimes(3);
      expect(screen.queryByText(expectedError)).not.toBeInTheDocument();
      expect(screen.getByText("₹18,500")).toBeInTheDocument();
      expect(screen.getByRole("button", { name: "See what I could check next" })).toBeEnabled();
    });
  });
});