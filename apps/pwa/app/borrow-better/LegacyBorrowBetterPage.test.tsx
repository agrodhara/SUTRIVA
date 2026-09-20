import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { buildBorrowBetterPayload } from "./formState";

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

async function renderBorrowBetterPage() {
  const pageModule = await import("./LegacyBorrowBetterPage");
  render(<pageModule.default />);
}

function borrowResult(overrides: Record<string, unknown> = {}) {
  return {
    comfort_status: "CAUTION",
    illustrative_annual_rate_percent: 14,
    existing_debt_payments: 20000,
    non_debt_commitments: 30000,
    estimated_new_monthly_commitment: 17122,
    total_monthly_commitment: 67122,
    commitment_ratio: 0.6712,
    debt_ratio_before: 0.2,
    debt_ratio_after: 0.3712,
    committed_ratio_before: 0.5,
    committed_ratio_after: 0.6712,
    breathing_room_before: 50000,
    breathing_room_after: 32878,
    total_repayment: 616392,
    total_interest: 116392,
    reason_codes: ["COMMITMENT_RATIO_CAUTION"],
    next_best_action: "Review amount and tenure.",
    ...overrides,
  };
}

function deferred<T>() {
  let resolve!: (value: T) => void;
  let reject!: (reason?: unknown) => void;
  const promise = new Promise<T>((res, rej) => {
    resolve = res;
    reject = rej;
  });
  return { promise, resolve, reject };
}

async function fillBorrowFormTrack11A(user: ReturnType<typeof userEvent.setup>) {
  await user.type(screen.getByLabelText("Monthly income"), "100000");
  await user.type(screen.getByLabelText("Existing debt payments"), "20000");
  await user.type(screen.getByLabelText("Housing or rent"), "20000");
  await user.type(screen.getByLabelText("Household or utilities"), "4000");
  await user.type(screen.getByLabelText("Dependants or education"), "3000");
  await user.type(screen.getByLabelText("Recurring medical or insurance"), "2000");
  await user.type(screen.getByLabelText("Other essential commitments"), "1000");
  await user.type(screen.getByLabelText("Desired borrowing amount"), "500000");
  await user.type(screen.getByLabelText("Desired tenure (months)"), "36");
}

describe("LegacyBorrowBetterPage (Track 1.0; superseded 1.1A prototype code kept unreachable)", () => {
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
      json: async () => borrowResult(),
    }) as unknown as typeof fetch;
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("uses legacy Track 1.0 borrow field and contract when both flags are false", async () => {
    track11aEnabledMock.mockReturnValue(false);
    track11bEnabledMock.mockReturnValue(false);

    const user = userEvent.setup();
    await renderBorrowBetterPage();

    await waitFor(() => expect(screen.getByRole("button", { name: "Check borrowing comfort" })).toBeEnabled());

    expect(screen.getByLabelText("Existing monthly commitments")).toBeInTheDocument();
    expect(screen.queryByLabelText("Existing debt payments")).not.toBeInTheDocument();
    expect(screen.queryByLabelText("Housing or rent")).not.toBeInTheDocument();
    expect(screen.queryByLabelText("Household or utilities")).not.toBeInTheDocument();
    expect(screen.queryByLabelText("Dependants or education")).not.toBeInTheDocument();
    expect(screen.queryByLabelText("Recurring medical or insurance")).not.toBeInTheDocument();
    expect(screen.queryByLabelText("Other essential commitments")).not.toBeInTheDocument();

    await user.type(screen.getByLabelText("Monthly income"), "100000");
    await user.type(screen.getByLabelText("Existing monthly commitments"), "25000");
    await user.type(screen.getByLabelText("Desired borrowing amount"), "500000");
    await user.type(screen.getByLabelText("Desired tenure (months)"), "36");
    await user.click(screen.getByRole("button", { name: "Check borrowing comfort" }));

    await waitFor(() => expect(global.fetch).toHaveBeenCalledTimes(1));
    const firstBody = JSON.parse((vi.mocked(global.fetch).mock.calls[0]?.[1] as RequestInit).body as string);

    expect(firstBody).toEqual({
      calculation_mode: "legacy_total_commitments",
      monthly_income: 100000,
      existing_monthly_commitments: 25000,
      desired_borrowing_amount: 500000,
      desired_tenure_months: 36,
    });
    expect(firstBody).not.toHaveProperty("existing_debt_payments");
    expect(firstBody).not.toHaveProperty("housing_rent");
  });

  it("uses grouped Track 1.1A fields and contract when Track 1.1A is enabled", async () => {
    track11aEnabledMock.mockReturnValue(true);
    track11bEnabledMock.mockReturnValue(false);

    const user = userEvent.setup();
    await renderBorrowBetterPage();

    await waitFor(() => expect(screen.getByRole("button", { name: "Check borrowing comfort" })).toBeEnabled());

    expect(screen.queryByLabelText("Existing monthly commitments")).not.toBeInTheDocument();
    expect(screen.getByLabelText("Existing debt payments")).toBeInTheDocument();
    expect(screen.getByLabelText("Housing or rent")).toBeInTheDocument();
    expect(screen.getByLabelText("Household or utilities")).toBeInTheDocument();
    expect(screen.getByLabelText("Dependants or education")).toBeInTheDocument();
    expect(screen.getByLabelText("Recurring medical or insurance")).toBeInTheDocument();
    expect(screen.getByLabelText("Other essential commitments")).toBeInTheDocument();

    await fillBorrowFormTrack11A(user);
    await user.click(screen.getByRole("button", { name: "Check borrowing comfort" }));

    await waitFor(() => expect(global.fetch).toHaveBeenCalledTimes(1));
    const firstBody = JSON.parse((vi.mocked(global.fetch).mock.calls[0]?.[1] as RequestInit).body as string);

    expect(firstBody).toEqual({
      calculation_mode: "track_11a_breakdown",
      monthly_income: 100000,
      existing_debt_payments: 20000,
      housing_rent: 20000,
      household_utilities: 4000,
      dependants_education: 3000,
      recurring_medical_insurance: 2000,
      other_essential_commitments: 1000,
      desired_borrowing_amount: 500000,
      desired_tenure_months: 36,
      illustrative_annual_rate_percent: 14,
    });
  });

  it("keeps payload builder aligned with visible form mode", () => {
    expect(buildBorrowBetterPayload({
      monthly_income: "100000",
      existing_monthly_commitments: "25000",
      existing_debt_payments: "20000",
      housing_rent: "20000",
      household_utilities: "4000",
      dependants_education: "3000",
      recurring_medical_insurance: "2000",
      other_essential_commitments: "1000",
      desired_borrowing_amount: "500000",
      desired_tenure_months: "36",
      illustrative_annual_rate_percent: "14",
      month_end_position: "tight",
    }, false)).toEqual({
      calculation_mode: "legacy_total_commitments",
      monthly_income: 100000,
      existing_monthly_commitments: 25000,
      desired_borrowing_amount: 500000,
      desired_tenure_months: 36,
    });

    expect(buildBorrowBetterPayload({
      monthly_income: "100000",
      existing_monthly_commitments: "25000",
      existing_debt_payments: "20000",
      housing_rent: "20000",
      household_utilities: "4000",
      dependants_education: "3000",
      recurring_medical_insurance: "2000",
      other_essential_commitments: "1000",
      desired_borrowing_amount: "500000",
      desired_tenure_months: "36",
      illustrative_annual_rate_percent: "14",
      month_end_position: "tight",
    }, true)).toEqual({
      calculation_mode: "track_11a_breakdown",
      monthly_income: 100000,
      existing_debt_payments: 20000,
      housing_rent: 20000,
      household_utilities: 4000,
      dependants_education: 3000,
      recurring_medical_insurance: 2000,
      other_essential_commitments: 1000,
      desired_borrowing_amount: 500000,
      desired_tenure_months: 36,
      illustrative_annual_rate_percent: 14,
    });
  });

  it("keeps previous result and supports retry after a deterministic what-if failure", async () => {
    global.fetch = vi
      .fn()
      .mockResolvedValueOnce({
        ok: true,
        json: async () => borrowResult(),
      })
      .mockResolvedValueOnce({ ok: false, json: async () => ({}) })
      .mockResolvedValueOnce({
        ok: true,
        json: async () => borrowResult({
          estimated_new_monthly_commitment: 18500,
          total_monthly_commitment: 68500,
          commitment_ratio: 0.685,
          debt_ratio_after: 0.385,
          committed_ratio_after: 0.685,
          breathing_room_after: 31500,
          total_repayment: 666000,
          total_interest: 166000,
        }),
      }) as unknown as typeof fetch;

    const user = userEvent.setup();
    await renderBorrowBetterPage();

    await waitFor(() => expect(screen.getByRole("button", { name: "Check borrowing comfort" })).toBeEnabled());

    await fillBorrowFormTrack11A(user);
    await user.click(screen.getByRole("button", { name: "Check borrowing comfort" }));

    await screen.findByRole("heading", { name: "Your borrowing comfort check" });
    expect(screen.getByText("₹17,122")).toBeInTheDocument();

    const whatIfAmount = screen.getAllByRole("spinbutton")[0] as HTMLInputElement;
    const whatIfForm = screen.getByRole("heading", { name: "Want to improve this?" }).closest("section")?.querySelector("form") as HTMLFormElement;
    await user.clear(whatIfAmount);
    await user.type(whatIfAmount, "510000");
    expect(whatIfAmount).toHaveValue(510000);

    fireEvent.submit(whatIfForm);

    const expectedError = "We couldn’t update your estimate. Your previous result is still shown. Please try again.";
    await screen.findByText(expectedError);
    expect(screen.queryByText("Failed to fetch")).not.toBeInTheDocument();
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

  it("protects against out-of-order what-if responses and stale failures", async () => {
    const whatIfA = deferred<{ ok: boolean; json: () => Promise<Record<string, unknown>> }>();
    const whatIfB = deferred<{ ok: boolean; json: () => Promise<Record<string, unknown>> }>();
    const whatIfC = deferred<{ ok: boolean; json: () => Promise<Record<string, unknown>> }>();
    const whatIfD = deferred<{ ok: boolean; json: () => Promise<Record<string, unknown>> }>();

    global.fetch = vi
      .fn()
      .mockResolvedValueOnce({ ok: true, json: async () => borrowResult() })
      .mockImplementationOnce(() => whatIfA.promise as unknown as Promise<Response>)
      .mockImplementationOnce(() => whatIfB.promise as unknown as Promise<Response>)
      .mockImplementationOnce(() => whatIfC.promise as unknown as Promise<Response>)
      .mockImplementationOnce(() => whatIfD.promise as unknown as Promise<Response>);

    const user = userEvent.setup();
    await renderBorrowBetterPage();
    await waitFor(() => expect(screen.getByRole("button", { name: "Check borrowing comfort" })).toBeEnabled());

    await fillBorrowFormTrack11A(user);
    await user.click(screen.getByRole("button", { name: "Check borrowing comfort" }));
    await screen.findByRole("heading", { name: "Your borrowing comfort check" });

    const amountInput = screen.getAllByRole("spinbutton")[0] as HTMLInputElement;
    const whatIfForm = screen.getByRole("heading", { name: "Want to improve this?" }).closest("section")?.querySelector("form") as HTMLFormElement;

    await user.clear(amountInput);
    await user.type(amountInput, "510000");
    fireEvent.submit(whatIfForm);

    await user.clear(amountInput);
    await user.type(amountInput, "520000");
    fireEvent.submit(whatIfForm);

    await waitFor(() => expect(global.fetch).toHaveBeenCalledTimes(3));

    whatIfB.resolve({
      ok: true,
      json: async () => borrowResult({ estimated_new_monthly_commitment: 18200, total_monthly_commitment: 68200 }),
    });
    await screen.findByText("₹18,200");

    whatIfA.resolve({
      ok: true,
      json: async () => borrowResult({ estimated_new_monthly_commitment: 19000, total_monthly_commitment: 69000 }),
    });
    await waitFor(() => {
      expect(screen.getByText("₹18,200")).toBeInTheDocument();
      expect(screen.queryByText("₹19,000")).not.toBeInTheDocument();
    });

    await user.clear(amountInput);
    await user.type(amountInput, "530000");
    fireEvent.submit(whatIfForm);

    await user.clear(amountInput);
    await user.type(amountInput, "540000");
    fireEvent.submit(whatIfForm);

    await waitFor(() => expect(global.fetch).toHaveBeenCalledTimes(5));

    whatIfD.resolve({
      ok: true,
      json: async () => borrowResult({ estimated_new_monthly_commitment: 18400, total_monthly_commitment: 68400 }),
    });
    await screen.findByText("₹18,400");

    whatIfC.resolve({ ok: false, json: async () => ({}) });
    await waitFor(() => {
      expect(screen.getByText("₹18,400")).toBeInTheDocument();
      expect(screen.queryByRole("alert")).not.toBeInTheDocument();
    });

    const sentBodies = vi.mocked(global.fetch).mock.calls.map((call) => JSON.parse((call[1] as RequestInit).body as string));
    expect(sentBodies[2].desired_borrowing_amount).toBe(520000);
    expect(sentBodies[4].desired_borrowing_amount).toBe(540000);
  });

  it("enables continuation only when Track 1.1A=true and Track 1.1B=true", async () => {
    track11aEnabledMock.mockReturnValue(true);
    track11bEnabledMock.mockReturnValue(true);

    const user = userEvent.setup();
    await renderBorrowBetterPage();

    await waitFor(() => expect(screen.getByRole("button", { name: "Check borrowing comfort" })).toBeEnabled());
    await user.click(screen.getByRole("button", { name: "Use example values" }));
    await user.click(screen.getByRole("button", { name: "Check borrowing comfort" }));
    await screen.findByRole("heading", { name: "Your borrowing comfort check" });

    await user.click(screen.getByRole("button", { name: "See what I could check next" }));
    await screen.findByRole("heading", { name: "Your answer is based on what you told us" });
  });
});
