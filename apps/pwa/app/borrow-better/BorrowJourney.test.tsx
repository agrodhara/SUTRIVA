import { readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";
import { cleanup, render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const { trackEventMock, configuredRate } = vi.hoisted(() => ({
  trackEventMock: vi.fn(),
  configuredRate: { value: 14 },
}));

vi.mock("../../lib/api", () => ({
  ensureAnonymousSession: vi.fn().mockResolvedValue(undefined),
  requireApiBaseUrl: () => "http://127.0.0.1:8010",
  trackEvent: trackEventMock,
}));

vi.mock("../../lib/track11Config", () => ({
  get BORROW_ILLUSTRATIVE_ANNUAL_RATE_PERCENT() {
    return configuredRate.value;
  },
}));

import { BorrowJourney } from "./BorrowJourney";

const CHECK_PATH = "/v1/borrowing-intelligence/comfortable-borrowing-check";
const PREVIEW_PATH = "/v1/borrowing-intelligence/emi-preview";

const referenceCheck = {
  policy_version: "borrow_better_v0_1",
  illustrative_annual_rate_percent: 14,
  existing_debt_payments: 18000,
  non_debt_commitments: 57000,
  estimated_new_monthly_commitment: 17088.81,
  total_monthly_commitment: 92088.81,
  commitment_ratio: 0.7674,
  debt_ratio_before: 0.15,
  debt_ratio_after: 0.2924,
  committed_ratio_before: 0.625,
  committed_ratio_after: 0.7674,
  breathing_room_before: 45000,
  breathing_room_after: 27911.19,
  total_repayment: 615197.34,
  total_interest: 115197.34,
  main_pressure: { code: "PROPOSED_EMI_REDUCES_BREATHING_ROOM", monthly_amount: 17088.81 },
  loan_reduction_nudge: { reduction_amount: 100000, monthly_breathing_room_preserved: 3417.76 },
  reconciliation_note: null,
  emi_ending_note: null,
  comfort_status: "CAUTION",
  reason_codes: ["INCOME_UNVERIFIED"],
  next_best_action: "Income is self-declared or not yet verified.",
  guidance_disclaimer: "Indicative financial-intelligence guidance.",
};

const referencePreview = {
  illustrative_annual_rate_percent: 14,
  estimated_monthly_emi: 17088.81,
  guidance_disclaimer: "Indicative financial-intelligence guidance.",
};

type FetchCall = { url: string; body: Record<string, unknown>; signal?: AbortSignal | null };
let calls: FetchCall[] = [];
let checkResponse: () => Promise<unknown> | unknown;
let previewResponse: (call: FetchCall) => Promise<unknown> | unknown;

function okResponse(data: unknown) {
  return { ok: true, status: 200, json: async () => data };
}

function installFetch() {
  calls = [];
  checkResponse = () => okResponse(referenceCheck);
  previewResponse = () => okResponse(referencePreview);
  global.fetch = vi.fn(async (url: string, init?: RequestInit) => {
    const call: FetchCall = { url, body: JSON.parse(String(init?.body ?? "{}")), signal: init?.signal };
    calls.push(call);
    if (url.endsWith(PREVIEW_PATH)) return previewResponse(call);
    if (url.endsWith(CHECK_PATH)) return checkResponse();
    throw new Error(`unexpected url ${url}`);
  }) as unknown as typeof fetch;
}

const previewCalls = () => calls.filter((call) => call.url.endsWith(PREVIEW_PATH));
const checkCalls = () => calls.filter((call) => call.url.endsWith(CHECK_PATH));

type User = ReturnType<typeof userEvent.setup>;

async function fillPosition(user: User, overrides: Partial<Record<string, string>> = {}) {
  const values = {
    "Monthly take-home income": "120000",
    "Existing loan and card payments": "18000",
    Housing: "28000",
    "Household and utilities": "11000",
    "Dependants and education": "12000",
    "Recurring medical or insurance": "6000",
    ...overrides,
  };
  for (const [label, value] of Object.entries(values)) {
    if (value !== "") await user.type(screen.getByLabelText(label), value);
  }
}

async function completeStep2(user: User, month = "Usually have money left") {
  await fillPosition(user);
  await user.click(screen.getByRole("radio", { name: month }));
  await user.click(screen.getByRole("button", { name: "Continue" }));
  await screen.findByRole("heading", { name: "Your borrowing plan" });
}

async function fillPlan(user: User, amount = "500000", tenure = "36") {
  await user.type(screen.getByLabelText("Loan amount"), amount);
  await user.selectOptions(screen.getByLabelText("Tenure"), tenure);
}

async function completeStep3(user: User) {
  await fillPlan(user);
  await user.click(screen.getByRole("button", { name: "Continue" }));
  await screen.findByRole("heading", { name: "Your Borrow Better check" });
}

async function reachStep5(user: User) {
  await completeStep2(user);
  await completeStep3(user);
  await user.click(screen.getByRole("button", { name: "See a connected-data example" }));
  await screen.findByRole("heading", { name: "Your figures at a glance" });
}

beforeEach(() => {
  trackEventMock.mockReset();
  configuredRate.value = 14;
  window.sessionStorage.clear();
  window.localStorage.clear();
  window.history.replaceState(null, "", "/");
  installFetch();
});

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
});

const eventSummary = () => trackEventMock.mock.calls.map(([type, journey, details]) => `${type}|${journey}|${details.screenName}`);

describe("Step 2 — Your monthly position", () => {
  it("shows the final fields and no legacy fifth essential", async () => {
    render(<BorrowJourney />);
    expect(await screen.findByRole("heading", { name: "Your monthly position" })).toBeInTheDocument();
    expect(screen.getByText("A few key details give us a clearer picture. This is not a full budget.")).toBeInTheDocument();
    for (const label of ["Monthly take-home income", "Existing loan and card payments", "Housing", "Household and utilities", "Dependants and education", "Recurring medical or insurance"]) {
      expect(screen.getByLabelText(label)).toBeInTheDocument();
    }
    expect(screen.queryByLabelText(/other essential/i)).toBeNull();
    expect(screen.getByText("Essential monthly expenses")).toBeInTheDocument();
  });

  it("offers the four month-end choices as native radios with nothing preselected", async () => {
    render(<BorrowJourney />);
    const group = await screen.findByRole("group", { name: "Usual month-end position" });
    const radios = within(group).getAllByRole("radio") as HTMLInputElement[];
    expect(radios.map((radio) => radio.closest("label")?.textContent)).toEqual([
      "Usually have money left",
      "Break even",
      "Usually fall short",
      "Not sure",
    ]);
    expect(radios.every((radio) => radio.type === "radio" && !radio.checked)).toBe(true);
  });

  it("blocks Continue on blank input, never sends a request and never treats blank as zero", async () => {
    const user = userEvent.setup();
    render(<BorrowJourney />);
    await user.click(await screen.findByRole("button", { name: "Continue" }));

    expect(screen.getByRole("heading", { name: "Your monthly position" })).toBeInTheDocument();
    expect(screen.getByLabelText("Monthly take-home income")).toHaveAttribute("aria-invalid", "true");
    expect(screen.getByLabelText("Housing")).toHaveAttribute("aria-invalid", "true");
    expect(screen.getByText("Choose how your month usually ends.")).toBeInTheDocument();
    expect(calls).toHaveLength(0);
    expect(screen.getByLabelText("Housing")).toHaveValue("");
    expect(screen.getByLabelText("Monthly take-home income")).toHaveFocus();
  });

  it("requires the month-end choice even when every amount is filled", async () => {
    const user = userEvent.setup();
    render(<BorrowJourney />);
    await fillPosition(user);
    await user.click(screen.getByRole("button", { name: "Continue" }));
    expect(screen.getByRole("heading", { name: "Your monthly position" })).toBeInTheDocument();
    expect(screen.getByText("Choose how your month usually ends.")).toBeInTheDocument();
  });

  it("ties the month-end error to its fieldset and clears the link once answered", async () => {
    const user = userEvent.setup();
    render(<BorrowJourney />);
    await user.click(await screen.findByRole("button", { name: "Continue" }));

    const group = screen.getByRole("group", { name: "Usual month-end position" });
    expect(group).toHaveAttribute("aria-describedby", "borrow-month-end-error");
    expect(group).toHaveAccessibleDescription("Choose how your month usually ends.");
    expect(document.getElementById("borrow-month-end-error")).toHaveTextContent("Choose how your month usually ends.");

    await user.click(within(group).getByRole("radio", { name: "Break even" }));
    expect(document.getElementById("borrow-month-end-error")).toBeNull();
    expect(group).not.toHaveAttribute("aria-describedby");
  });

  it("accepts an entered zero for payments and essentials", async () => {
    const user = userEvent.setup();
    render(<BorrowJourney />);
    await fillPosition(user, { "Existing loan and card payments": "0", Housing: "0", "Household and utilities": "0", "Dependants and education": "0", "Recurring medical or insurance": "0" });
    await user.click(screen.getByRole("radio", { name: "Not sure" }));
    await user.click(screen.getByRole("button", { name: "Continue" }));
    expect(await screen.findByRole("heading", { name: "Your borrowing plan" })).toBeInTheDocument();
  });

  it("rejects zero income and negative amounts, without turning the negative into a positive value", async () => {
    const user = userEvent.setup();
    render(<BorrowJourney />);
    await fillPosition(user, { "Monthly take-home income": "0", Housing: "-5" });
    await user.click(screen.getByRole("radio", { name: "Break even" }));
    await user.click(screen.getByRole("button", { name: "Continue" }));
    expect(screen.getByRole("heading", { name: "Your monthly position" })).toBeInTheDocument();
    expect(screen.getByText("Enter an amount above 0.")).toBeInTheDocument();
    // The typed minus sign is preserved, so the amount stays invalid: it must never read as a positive "5".
    expect(screen.getByLabelText("Housing")).toHaveValue("-5");
    expect(screen.getByText("Enter an amount of 0 or more.")).toBeInTheDocument();
  });

  it("keeps a pasted negative amount negative and invalid, not a positive value", async () => {
    const user = userEvent.setup();
    render(<BorrowJourney />);
    const housing = screen.getByLabelText("Housing");
    await user.click(housing);
    await user.paste("-28000");
    expect(housing).toHaveValue("-28,000");

    await user.click(housing);
    await user.keyboard("{Control>}a{/Control}");
    await user.paste("−28000");
    expect(housing).toHaveValue("-28,000");
  });
});

describe("Step 3 — Your borrowing plan", () => {
  it("is a separate screen offering the five tenures, the purpose list and the EMI-ending choice", async () => {
    const user = userEvent.setup();
    render(<BorrowJourney />);
    await completeStep2(user);

    expect(screen.queryByLabelText("Monthly take-home income")).toBeNull();
    const tenure = screen.getByLabelText("Tenure") as HTMLSelectElement;
    expect(Array.from(tenure.options).map((option) => option.value)).toEqual(["", "12", "24", "36", "48", "60"]);
    expect(tenure.value).toBe("");

    const purpose = screen.getByLabelText(/^Purpose/) as HTMLSelectElement;
    expect(Array.from(purpose.options).map((option) => option.text)).toEqual([
      "Not specified",
      "Home improvement",
      "Education",
      "Medical",
      "Debt consolidation",
      "Vehicle",
      "Household purchase",
      "Other",
    ]);
    expect(purpose.value).toBe("");

    const group = screen.getByRole("group", { name: /Will an existing EMI end within six months/ });
    expect(within(group).getAllByRole("radio").map((radio) => radio.closest("label")?.textContent)).toEqual(["Yes", "No", "Not sure"]);
    expect(within(group).getAllByRole("radio").every((radio) => !(radio as HTMLInputElement).checked)).toBe(true);
  });

  it("has no free-text purpose and no free numeric tenure input", async () => {
    const user = userEvent.setup();
    render(<BorrowJourney />);
    await completeStep2(user);
    expect(screen.queryByRole("spinbutton")).toBeNull();
    expect(screen.queryByLabelText(/months/i)).toBeNull();
    expect(screen.getByLabelText(/^Purpose/).tagName).toBe("SELECT");
  });

  it("shows the canonical read-only rate copy with no rate input and no change control", async () => {
    const user = userEvent.setup();
    render(<BorrowJourney />);
    await completeStep2(user);

    expect(screen.getByTestId("rate-copy")).toHaveTextContent("Illustrative annual rate: 14%. Configured by policy; not a loan offer.");
    expect(screen.queryByLabelText(/rate/i)).toBeNull();
    expect(screen.queryByRole("textbox", { name: /rate/i })).toBeNull();
    expect(screen.queryByRole("spinbutton")).toBeNull();
    expect(screen.queryByText(/change rate/i)).toBeNull();
    expect(screen.queryByRole("button", { name: /rate/i })).toBeNull();
    expect(screen.queryByText(/replace it with/i)).toBeNull();
  });

  it("takes the displayed rate from policy, never from a literal", async () => {
    configuredRate.value = 12.5;
    const user = userEvent.setup();
    render(<BorrowJourney />);
    await completeStep2(user);
    expect(screen.getByTestId("rate-copy")).toHaveTextContent("Illustrative annual rate: 12.5%. Configured by policy; not a loan offer.");
  });

  it("replaces the configured rate with the backend-echoed rate once known", async () => {
    previewResponse = () => okResponse({ ...referencePreview, illustrative_annual_rate_percent: 15 });
    const user = userEvent.setup();
    render(<BorrowJourney />);
    await completeStep2(user);
    await fillPlan(user);
    await waitFor(() => expect(screen.getByTestId("rate-copy")).toHaveTextContent("Illustrative annual rate: 15%."));
  });

  it("requests the backend EMI only once amount and tenure are valid, with no rate in the body", async () => {
    const user = userEvent.setup();
    render(<BorrowJourney />);
    await completeStep2(user);

    await user.type(screen.getByLabelText("Loan amount"), "500000");
    await new Promise((resolve) => setTimeout(resolve, 600));
    expect(previewCalls()).toHaveLength(0);

    await user.selectOptions(screen.getByLabelText("Tenure"), "36");
    expect(await screen.findByText("₹17,089")).toBeInTheDocument();
    expect(previewCalls()).toHaveLength(1);
    expect(previewCalls()[0].body).toEqual({ desired_borrowing_amount: 500000, desired_tenure_months: 36 });
    expect(screen.getByText("per month")).toBeInTheDocument();
  });

  it("debounces typing into one request", async () => {
    const user = userEvent.setup();
    render(<BorrowJourney />);
    await completeStep2(user);
    await user.selectOptions(screen.getByLabelText("Tenure"), "24");
    await user.type(screen.getByLabelText("Loan amount"), "250000");
    await screen.findByText("₹17,089");
    expect(previewCalls()).toHaveLength(1);
    expect(previewCalls()[0].body.desired_borrowing_amount).toBe(250000);
  });

  it("cancels the in-flight preview when inputs change and ignores its late response", async () => {
    const pending: { call: FetchCall; resolve: (value: unknown) => void }[] = [];
    previewResponse = (call) =>
      new Promise((resolve, reject) => {
        pending.push({ call, resolve });
        call.signal?.addEventListener("abort", () => reject(new DOMException("aborted", "AbortError")));
      });

    const user = userEvent.setup();
    render(<BorrowJourney />);
    await completeStep2(user);
    await fillPlan(user, "500000", "36");
    await waitFor(() => expect(previewCalls()).toHaveLength(1));

    await user.type(screen.getByLabelText("Loan amount"), "0");
    await waitFor(() => expect(previewCalls()).toHaveLength(2));
    expect(previewCalls()[0].signal?.aborted).toBe(true);

    pending[1].resolve(okResponse({ ...referencePreview, estimated_monthly_emi: 20000 }));
    expect(await screen.findByText("₹20,000")).toBeInTheDocument();
    pending[0].resolve(okResponse(referencePreview));
    await new Promise((resolve) => setTimeout(resolve, 50));
    expect(screen.queryByText("₹17,089")).toBeNull();
  });

  it("recovers from a preview failure without losing inputs", async () => {
    previewResponse = () => ({ ok: false, status: 500, json: async () => ({}) });
    const user = userEvent.setup();
    render(<BorrowJourney />);
    await completeStep2(user);
    await fillPlan(user);

    const alert = await screen.findByText("We couldn’t update the estimated EMI. Your details are still here.");
    expect(alert).toBeInTheDocument();
    expect(screen.getByLabelText("Loan amount")).toHaveValue("5,00,000");
    expect(screen.getByLabelText("Tenure")).toHaveValue("36");

    previewResponse = () => okResponse(referencePreview);
    await user.click(screen.getByRole("button", { name: "Try again" }));
    expect(await screen.findByText("₹17,089")).toBeInTheDocument();
    expect(screen.getByLabelText("Loan amount")).toHaveValue("5,00,000");
  });

  it("does not depend on the preview to continue: Continue runs the full backend check", async () => {
    previewResponse = () => ({ ok: false, status: 500, json: async () => ({}) });
    const user = userEvent.setup();
    render(<BorrowJourney />);
    await completeStep2(user);
    await completeStep3(user);
    expect(checkCalls()).toHaveLength(1);
  });

  it("requires an amount and a tenure before continuing", async () => {
    const user = userEvent.setup();
    render(<BorrowJourney />);
    await completeStep2(user);
    await user.click(screen.getByRole("button", { name: "Continue" }));
    expect(screen.getByRole("heading", { name: "Your borrowing plan" })).toBeInTheDocument();
    expect(screen.getByLabelText("Loan amount")).toHaveAttribute("aria-invalid", "true");
    expect(screen.getByText("Choose a tenure.")).toBeInTheDocument();
    expect(checkCalls()).toHaveLength(0);
  });

  it("sends the full check with no rate and only answered optional fields", async () => {
    const user = userEvent.setup();
    render(<BorrowJourney />);
    await completeStep2(user);
    await completeStep3(user);

    expect(checkCalls()[0].body).toEqual({
      calculation_mode: "track_11a_breakdown",
      monthly_income: 120000,
      existing_debt_payments: 18000,
      housing_rent: 28000,
      household_utilities: 11000,
      dependants_education: 12000,
      recurring_medical_insurance: 6000,
      desired_borrowing_amount: 500000,
      desired_tenure_months: 36,
      month_end_position: "money_left",
    });
  });

  it("sends purpose and the EMI-ending answer when chosen", async () => {
    const user = userEvent.setup();
    render(<BorrowJourney />);
    await completeStep2(user, "Usually fall short");
    await fillPlan(user);
    await user.selectOptions(screen.getByLabelText(/^Purpose/), "home_improvement");
    await user.click(screen.getByRole("radio", { name: "Yes" }));
    await user.click(screen.getByRole("button", { name: "Continue" }));
    await screen.findByRole("heading", { name: "Your Borrow Better check" });

    expect(checkCalls()[0].body).toMatchObject({
      month_end_position: "fall_short",
      loan_purpose: "home_improvement",
      existing_emi_ending_within_six_months: "yes",
    });
  });

  it("keeps inputs and shows a recoverable error when the check fails, then succeeds on retry", async () => {
    checkResponse = () => ({ ok: false, status: 503, json: async () => ({}) });
    const user = userEvent.setup();
    render(<BorrowJourney />);
    await completeStep2(user);
    await fillPlan(user);
    await user.click(screen.getByRole("button", { name: "Continue" }));

    expect(await screen.findByText(/We couldn’t complete your Borrow Better check/)).toBeInTheDocument();
    expect(screen.getByRole("heading", { name: "Your borrowing plan" })).toBeInTheDocument();
    expect(screen.getByLabelText("Loan amount")).toHaveValue("5,00,000");
    expect(eventSummary()).not.toContain("result_declared|comfortable_borrowing|borrow_check");

    checkResponse = () => okResponse(referenceCheck);
    await user.click(screen.getByRole("button", { name: "Continue" }));
    expect(await screen.findByRole("heading", { name: "Your Borrow Better check" })).toBeInTheDocument();
  });

  it("sends one check for a double click", async () => {
    let release!: (value: unknown) => void;
    checkResponse = () => new Promise((resolve) => { release = resolve; });
    const user = userEvent.setup();
    render(<BorrowJourney />);
    await completeStep2(user);
    await fillPlan(user);
    const button = screen.getByRole("button", { name: "Continue" });
    await user.dblClick(button);
    expect(checkCalls()).toHaveLength(1);
    release(okResponse(referenceCheck));
    await screen.findByRole("heading", { name: "Your Borrow Better check" });
    expect(checkCalls()).toHaveLength(1);
  });
});

describe("Step 4 — Your Borrow Better check", () => {
  it("renders the reference result with exact whole-rupee figures", async () => {
    const user = userEvent.setup();
    render(<BorrowJourney />);
    await completeStep2(user);
    await completeStep3(user);

    const debt = screen.getByRole("region", { name: /Debt payments/ });
    expect(debt).toHaveTextContent("15%");
    expect(debt).toHaveTextContent("29%");
    expect(debt).toHaveTextContent("Before");
    expect(debt).toHaveTextContent("After");

    const room = screen.getByRole("region", { name: "Monthly breathing room" });
    expect(room).toHaveTextContent("₹45,000");
    expect(room).toHaveTextContent("₹27,911");

    expect(screen.getByText("Estimated EMI").parentElement).toHaveTextContent("₹17,089");
    expect(screen.getByText("Total repayment").parentElement).toHaveTextContent("₹6,15,197");
    expect(screen.getByText("Total repayment").parentElement).toHaveTextContent("over 3 years");
    expect(screen.getByText("Total interest").parentElement).toHaveTextContent("₹1,15,197");
  });

  it("shows the finding beside the chart it explains, and the ₹1 lakh nudge", async () => {
    const user = userEvent.setup();
    render(<BorrowJourney />);
    await completeStep2(user);
    await completeStep3(user);

    expect(screen.getByText("This loan would add about ₹17,089 to your monthly payments.")).toBeInTheDocument();
    expect(screen.getByText(/leaving ₹45,000\. This loan's EMI would leave about ₹27,911\./)).toBeInTheDocument();
    expect(screen.getByText("Reducing the loan by ₹1 lakh could preserve about ₹3,418 of monthly breathing room.")).toBeInTheDocument();
  });

  it("takes the finding's figures from the response's own breathing-room and EMI fields, not a stale calculation", async () => {
    checkResponse = () =>
      okResponse({
        ...referenceCheck,
        estimated_new_monthly_commitment: 9200,
        breathing_room_after: 45000 - 9200,
        loan_reduction_nudge: { reduction_amount: 100000, monthly_breathing_room_preserved: 2100 },
      });
    const user = userEvent.setup();
    render(<BorrowJourney />);
    await completeStep2(user);
    await completeStep3(user);
    expect(screen.getByText("This loan would add about ₹9,200 to your monthly payments.")).toBeInTheDocument();
    expect(screen.getByText(/leave about ₹35,800\./)).toBeInTheDocument();
    expect(screen.getByText(/could preserve about ₹2,100 of monthly/)).toBeInTheDocument();
  });

  it("omits the nudge when the backend returns none", async () => {
    checkResponse = () => okResponse({ ...referenceCheck, loan_reduction_nudge: null });
    const user = userEvent.setup();
    render(<BorrowJourney />);
    await completeStep2(user);
    await completeStep3(user);
    expect(screen.queryByText(/A possible nudge/)).toBeNull();
    expect(screen.queryByText(/Reducing the loan by/)).toBeNull();
  });

  it("marks a nudge that would still leave a shortfall as insufficient, not a reassuring green check", async () => {
    // Short by ₹12,089/month; the ₹1 lakh nudge only preserves ₹3,418 — nowhere near enough.
    checkResponse = () =>
      okResponse({
        ...referenceCheck,
        breathing_room_before: 5000,
        breathing_room_after: 5000 - 17088.81,
        loan_reduction_nudge: { reduction_amount: 100000, monthly_breathing_room_preserved: 3418 },
      });
    const user = userEvent.setup();
    render(<BorrowJourney />);
    await completeStep2(user);
    await completeStep3(user);

    const nudgeHeading = screen.getByRole("heading", { name: "A possible nudge" });
    expect(screen.getByText("Reducing the loan by ₹1 lakh could preserve about ₹3,418 of monthly breathing room.")).toBeInTheDocument();
    expect(screen.getByText("This reduces the shortfall but does not close it — you would still be about ₹8,671 short each month.")).toBeInTheDocument();
    // Same insight row as the shortfall finding above it: a warning icon, not the green check used when a
    // nudge is genuinely sufficient (see the reference-example test above, which keeps the plain sentence).
    const nudgeIcon = nudgeHeading.closest("div")?.previousElementSibling;
    expect(nudgeIcon).toHaveTextContent("!");
    expect(nudgeIcon).not.toHaveTextContent("✓");
  });

  it("keeps the plain, unqualified nudge sentence and the green check when the nudge would actually close the shortfall", async () => {
    // Short by ₹500/month; the ₹1 lakh nudge preserves ₹3,418 — comfortably enough to close it.
    checkResponse = () =>
      okResponse({
        ...referenceCheck,
        breathing_room_before: 16588.81,
        breathing_room_after: -500,
        loan_reduction_nudge: { reduction_amount: 100000, monthly_breathing_room_preserved: 3418 },
      });
    const user = userEvent.setup();
    render(<BorrowJourney />);
    await completeStep2(user);
    await completeStep3(user);

    const nudgeHeading = screen.getByRole("heading", { name: "A possible nudge" });
    expect(screen.getByText("Reducing the loan by ₹1 lakh could preserve about ₹3,418 of monthly breathing room.")).toBeInTheDocument();
    expect(screen.queryByText(/does not close it/)).toBeNull();
    const nudgeIcon = nudgeHeading.closest("div")?.previousElementSibling;
    expect(nudgeIcon).toHaveTextContent("✓");
  });

  it("shows the rate from the response with the canonical copy, and the disclaimer", async () => {
    const user = userEvent.setup();
    render(<BorrowJourney />);
    await completeStep2(user);
    await completeStep3(user);
    expect(screen.getByText("Illustrative annual rate: 14%. Configured by policy; not a loan offer.")).toBeInTheDocument();
    expect(screen.getByText("Indicative estimate — not a loan approval, eligibility decision or offer.")).toBeInTheDocument();
  });

  it("preserves and renders a negative breathing room with U+2212, never clamped", async () => {
    checkResponse = () =>
      okResponse({
        ...referenceCheck,
        breathing_room_after: -125888.15,
        main_pressure: { ...referenceCheck.main_pressure, monthly_amount: 170888.15 },
      });
    const user = userEvent.setup();
    render(<BorrowJourney />);
    await completeStep2(user);
    await completeStep3(user);

    const room = screen.getByRole("region", { name: "Monthly breathing room" });
    expect(room).toHaveTextContent("−₹1,25,888");
    expect(room.textContent).not.toMatch(/-/);
    expect(room).toHaveTextContent("below zero");
  });

  it("renders bounded reconciliation and EMI-ending notes from response codes", async () => {
    checkResponse = () => okResponse({ ...referenceCheck, reconciliation_note: "MONTH_END_FALL_SHORT", emi_ending_note: "EMI_MAY_END_WITHIN_SIX_MONTHS" });
    const user = userEvent.setup();
    render(<BorrowJourney />);
    await completeStep2(user);
    await completeStep3(user);
    expect(screen.getByText(/You said your month usually ends short/)).toBeInTheDocument();
    expect(screen.getByText(/You said an existing EMI may end within six months/)).toBeInTheDocument();
  });

  it("has none of the legacy or out-of-scope Step 4 controls", async () => {
    const user = userEvent.setup();
    render(<BorrowJourney />);
    await completeStep2(user);
    await completeStep3(user);

    for (const pattern of [/Proceed carefully/, /Looks comfortable/, /Consider reducing/, /Not comfortable right now/, /what-if/i, /Want to improve this/, /Update estimate/, /Use example values/, /Committed ratio/, /Total monthly commitment/, /See what I could check next/, /See borrowing options/, /I.d use this/, /What would be most useful next/]) {
      expect(screen.queryByText(pattern)).toBeNull();
    }
    expect(screen.queryByRole("slider")).toBeNull();
    expect(screen.getByRole("button", { name: "See a connected-data example" })).toBeInTheDocument();
  });
});

describe("Step 5 — What your real data could reveal", () => {
  it("references the Step 4 action instead of repeating the exact shortfall figure a third time", async () => {
    checkResponse = () => okResponse({ ...referenceCheck, breathing_room_after: -12089 });
    const user = userEvent.setup();
    render(<BorrowJourney />);
    await reachStep5(user);

    // Stated once, in the first declared-data panel, tied to its own chart.
    expect(screen.getByText("This is ₹12,089 more than your monthly take-home income.")).toBeInTheDocument();
    // The second panel points back to the one action already offered on the check, instead of restating
    // the same rupee figure again with no new information. It names the action (return to the check) and
    // does not imply that changing the amount or tenure would necessarily make the loan affordable.
    expect(screen.getByText("This shortfall isn't resolved here. Return to your check to try a different loan amount or tenure.")).toBeInTheDocument();
    expect(screen.queryByText(/reducing the loan amount or extending the tenure could help/)).toBeNull();
    expect(screen.queryByText(/monthly increase, leaving about/)).toBeNull();
  });

  it("keeps the plain 'monthly increase, leaving about' sentence when there is no shortfall", async () => {
    const user = userEvent.setup();
    render(<BorrowJourney />);
    await reachStep5(user);
    expect(screen.getByText("That's a ₹17,089 monthly increase, leaving about ₹27,911.")).toBeInTheDocument();
    expect(screen.queryByText(/this shortfall isn't resolved here/)).toBeNull();
  });

  it("is reached only by the Step 4 CTA and shows the fixed synthetic example", async () => {
    const user = userEvent.setup();
    render(<BorrowJourney />);
    await reachStep5(user);

    expect(screen.getByRole("note")).toHaveTextContent("ILLUSTRATIVE EXAMPLE — NOT YOUR DATA");
    expect(screen.getByRole("heading", { name: "What connected data could add" })).toBeInTheDocument();
    expect(screen.getByText("This fictional example shows what permissioned data could help analyse.")).toBeInTheDocument();
    expect(screen.getByText("Essential spending increased")).toBeInTheDocument();
    expect(screen.getByText("in 2 of the last 6 months.")).toBeInTheDocument();
    expect(screen.getByText("Income regularity")).toBeInTheDocument();
    expect(screen.getByText("Salary received consistently")).toBeInTheDocument();
    expect(screen.getByText("Recurring commitments")).toBeInTheDocument();
    expect(screen.getByText("₹31,500 identified")).toBeInTheDocument();
    expect(screen.getByText("Typical month-end buffer")).toBeInTheDocument();
    expect(screen.getByText("₹8,200")).toBeInTheDocument();
    expect(screen.getByText("A ₹6,000 EMI may end in 5 months")).toBeInTheDocument();
    // Plain language, not an invitation to connect now: this version doesn't.
    expect(screen.getByText("This version does not connect to your bank or bureau data.")).toBeInTheDocument();
  });

  it("gives the chart a complete text alternative", async () => {
    const user = userEvent.setup();
    render(<BorrowJourney />);
    await reachStep5(user);

    const chart = screen.getByRole("img", { name: /Bar chart of an example six-month cash-flow trend/ });
    expect(chart).toBeInTheDocument();
    const table = screen.getByRole("table");
    expect(within(table).getAllByRole("row")).toHaveLength(7);
    for (const month of ["Jan", "Feb", "Mar", "Apr", "May", "Jun"]) {
      expect(within(table).getByRole("rowheader", { name: month })).toBeInTheDocument();
    }
  });

  it("keeps the data table inside a labelled, keyboard-focusable scroll region so narrow screens never scroll the page", async () => {
    const user = userEvent.setup();
    render(<BorrowJourney />);
    await reachStep5(user);

    const table = screen.getByRole("table");
    const region = table.closest('[role="region"]') as HTMLElement;
    expect(region).not.toBeNull();
    expect(region).toHaveAttribute("tabindex", "0");
    expect(region).toHaveAccessibleName(/Example income and total commitments by month/);
    expect(region.contains(table)).toBe(true);
  });

  it("keeps the illustrative panel free of user values while the primary graphic uses them", async () => {
    const user = userEvent.setup();
    render(<BorrowJourney />);
    await completeStep2(user);
    await fillPlan(user, "731000", "48");
    await user.click(screen.getByRole("button", { name: "Continue" }));
    await screen.findByRole("heading", { name: "Your Borrow Better check" });
    await user.click(screen.getByRole("button", { name: "See a connected-data example" }));
    await screen.findByRole("note");

    const illustrative = screen.getByRole("region", { name: "What connected data could add" });
    const panelText = illustrative.textContent ?? "";
    for (const userValue of ["731000", "7,31,000", "1,20,000", "18,000", "57,000", "1,100"]) {
      expect(panelText).not.toContain(userValue);
    }

    const glance = screen.getByRole("region", { name: /Your monthly payment mix/ });
    expect(glance).toHaveTextContent("₹1,20,000");
    expect(glance).toHaveTextContent("₹57,000");
    expect(glance).toHaveTextContent("₹18,000");
    expect(glance).toHaveTextContent("Essential expenses");
    expect(glance).toHaveTextContent("Proposed EMI");
  });

  it("does not show the future Step 8 buffer", async () => {
    const user = userEvent.setup();
    render(<BorrowJourney />);
    await reachStep5(user);
    const text = document.body.textContent ?? "";
    expect(text).not.toContain("1,100");
    expect(text).not.toMatch(/post-loan buffer/i);
  });

  it("has no pilot CTA, disabled or otherwise, and no phone, OTP or permission controls", async () => {
    const user = userEvent.setup();
    render(<BorrowJourney />);
    await reachStep5(user);

    expect(screen.queryByText(/pilot/i)).toBeNull();
    expect(screen.queryByRole("button", { name: /pilot|join|interested/i })).toBeNull();
    expect(screen.queryByRole("link", { name: /pilot|join/i })).toBeNull();
    expect(screen.queryByRole("textbox")).toBeNull();
    expect(screen.queryByText(/OTP|mobile number|consent|connect account|connect bureau/i)).toBeNull();
    expect(screen.getAllByRole("button").map((button) => button.textContent)).toEqual(["Back to your check"]);
  });

  it("lets the user go back to Step 4 with the result intact", async () => {
    const user = userEvent.setup();
    render(<BorrowJourney />);
    await reachStep5(user);
    await user.click(screen.getByRole("button", { name: "Back to your check" }));
    expect(await screen.findByRole("heading", { name: "Your Borrow Better check" })).toBeInTheDocument();
    expect(screen.getByRole("region", { name: "Monthly breathing room" })).toHaveTextContent("₹27,911");
  });
});

describe("navigation and transient state", () => {
  it("retains inputs through Back from Step 3 to Step 2 and Step 4 to Step 3", async () => {
    const user = userEvent.setup();
    render(<BorrowJourney />);
    await completeStep2(user, "Break even");
    await fillPlan(user, "500000", "48");
    await user.selectOptions(screen.getByLabelText(/^Purpose/), "vehicle");
    await user.click(screen.getByRole("radio", { name: "No" }));
    await user.click(screen.getByRole("button", { name: "Continue" }));
    await screen.findByRole("heading", { name: "Your Borrow Better check" });

    await user.click(screen.getByRole("button", { name: "Back" }));
    await screen.findByRole("heading", { name: "Your borrowing plan" });
    expect(screen.getByLabelText("Loan amount")).toHaveValue("5,00,000");
    expect(screen.getByLabelText("Tenure")).toHaveValue("48");
    expect(screen.getByLabelText(/^Purpose/)).toHaveValue("vehicle");
    expect(screen.getByRole("radio", { name: "No" })).toBeChecked();

    await user.click(screen.getByRole("button", { name: "Back" }));
    await screen.findByRole("heading", { name: "Your monthly position" });
    expect(screen.getByLabelText("Monthly take-home income")).toHaveValue("1,20,000");
    expect(screen.getByLabelText("Housing")).toHaveValue("28,000");
    expect(screen.getByRole("radio", { name: "Break even" })).toBeChecked();
  });

  it("recomputes after an edit: an old result is never shown for changed inputs", async () => {
    const user = userEvent.setup();
    render(<BorrowJourney />);
    await completeStep2(user);
    await completeStep3(user);
    await user.click(screen.getByRole("button", { name: "Back" }));
    await screen.findByRole("heading", { name: "Your borrowing plan" });
    await user.selectOptions(screen.getByLabelText("Tenure"), "60");
    await user.click(screen.getByRole("button", { name: "Continue" }));
    await screen.findByRole("heading", { name: "Your Borrow Better check" });
    expect(checkCalls()).toHaveLength(2);
    expect(checkCalls()[1].body.desired_tenure_months).toBe(60);
  });

  it("restarts at Step 2 when history points past what has been completed (refresh or direct entry)", async () => {
    for (const stale of ["plan", "check", "connected_example"]) {
      window.history.replaceState({ borrowStep: stale }, "", "/");
      const view = render(<BorrowJourney />);
      expect(await screen.findByRole("heading", { name: "Your monthly position" })).toBeInTheDocument();
      expect(window.history.state).toEqual({ borrowStep: "monthly_position" });
      view.unmount();
    }
  });

  it("follows browser Back and Forward within the allowed steps and never past the result", async () => {
    const user = userEvent.setup();
    render(<BorrowJourney />);
    await completeStep2(user);
    await completeStep3(user);
    await user.click(screen.getByRole("button", { name: "See a connected-data example" }));
    await screen.findByRole("note");

    window.history.back();
    expect(await screen.findByRole("heading", { name: "Your Borrow Better check" })).toBeInTheDocument();
    window.history.back();
    expect(await screen.findByRole("heading", { name: "Your borrowing plan" })).toBeInTheDocument();

    // Editing invalidates the result, so Forward cannot reach Step 4 with stale figures.
    await user.selectOptions(screen.getByLabelText("Tenure"), "24");
    window.history.forward();
    await waitFor(() => expect(screen.getByRole("heading", { name: "Your borrowing plan" })).toBeInTheDocument());
    expect(screen.queryByRole("heading", { name: "Your Borrow Better check" })).toBeNull();
  });

  it("writes nothing sensitive to the URL, storage, cookies or history", async () => {
    const user = userEvent.setup();
    render(<BorrowJourney />);
    await reachStep5(user);

    expect(window.location.href).toBe("http://localhost:3000/");
    expect(window.localStorage.length).toBe(0);
    expect(window.sessionStorage.length).toBe(0);
    expect(document.cookie).toBe("");
    expect(window.history.state).toEqual({ borrowStep: "connected_example" });
  });

  it("merges the step id into existing history state so the Next.js router marker survives", async () => {
    window.history.replaceState({ __NA: true, __PRIVATE_NEXTJS_INTERNALS_TREE: ["tree"] }, "", "/");
    const user = userEvent.setup();
    render(<BorrowJourney />);
    await completeStep2(user);
    expect(window.history.state).toEqual({ __NA: true, __PRIVATE_NEXTJS_INTERNALS_TREE: ["tree"], borrowStep: "plan" });
    await user.click(screen.getByRole("button", { name: "Back" }));
    await screen.findByRole("heading", { name: "Your monthly position" });
    expect(window.history.state).toMatchObject({ __NA: true, borrowStep: "monthly_position" });
  });

  it("moves focus to the new step heading after navigation", async () => {
    const user = userEvent.setup();
    render(<BorrowJourney />);
    await completeStep2(user);
    await waitFor(() => expect(screen.getByRole("heading", { name: "Your borrowing plan" })).toHaveFocus());
  });
});

describe("analytics", () => {
  it("emits the six approved events exactly once each, in order, with only a screen name", async () => {
    const user = userEvent.setup();
    render(<BorrowJourney />);
    await reachStep5(user);

    expect(eventSummary()).toEqual([
      "step_viewed|comfortable_borrowing|borrow_monthly_position",
      "step_completed|comfortable_borrowing|borrow_monthly_position",
      "step_viewed|comfortable_borrowing|borrow_plan",
      "step_completed|comfortable_borrowing|borrow_plan",
      "result_declared|comfortable_borrowing|borrow_check",
      "connected_example_seen|comfortable_borrowing|borrow_connected_example",
    ]);
    for (const [, , details] of trackEventMock.mock.calls) {
      expect(Object.keys(details).sort()).toEqual(["journeyRunId", "screenName"]);
    }
  });

  it("does not emit on ordinary rerenders, typing or preview updates", async () => {
    const user = userEvent.setup();
    const view = render(<BorrowJourney />);
    await screen.findByRole("heading", { name: "Your monthly position" });
    await user.type(screen.getByLabelText("Monthly take-home income"), "120000");
    view.rerender(<BorrowJourney />);
    expect(eventSummary()).toEqual(["step_viewed|comfortable_borrowing|borrow_monthly_position"]);
  });

  it("emits a fresh screen-entry event when a step is genuinely re-entered, once per entry", async () => {
    const user = userEvent.setup();
    render(<BorrowJourney />);
    await completeStep2(user);
    await user.click(screen.getByRole("button", { name: "Back" }));
    await screen.findByRole("heading", { name: "Your monthly position" });
    expect(eventSummary().filter((event) => event.endsWith("borrow_monthly_position") && event.startsWith("step_viewed"))).toHaveLength(2);
  });

  it("carries no amounts, rate, purpose, month-end answer, EMI-ending answer, PII or free text", async () => {
    const user = userEvent.setup();
    render(<BorrowJourney />);
    await completeStep2(user, "Usually fall short");
    await fillPlan(user);
    await user.selectOptions(screen.getByLabelText(/^Purpose/), "debt_consolidation");
    await user.click(screen.getByRole("radio", { name: "Yes" }));
    await user.click(screen.getByRole("button", { name: "Continue" }));
    await screen.findByRole("heading", { name: "Your Borrow Better check" });
    await user.click(screen.getByRole("button", { name: "See a connected-data example" }));
    await screen.findByRole("note");

    const serialized = JSON.stringify(trackEventMock.mock.calls);
    for (const forbidden of ["120000", "500000", "18000", "28000", "14", "fall_short", "debt_consolidation", "yes", "money_left", "17088", "27911"]) {
      expect(serialized.replace(/[0-9a-f-]{36}/g, "")).not.toContain(forbidden);
    }
  });

  it("emits none of the legacy Reveal, Intent, Closure, pilot, OTP or consent events", async () => {
    const user = userEvent.setup();
    render(<BorrowJourney />);
    await reachStep5(user);
    const types = trackEventMock.mock.calls.map(([type]) => type as string);
    for (const legacy of ["teaser_viewed", "teaser_cta_selected", "next_interest_viewed", "next_interest_selected", "next_interest_skipped", "decline_reason_selected", "go_deeper_selected", "go_deeper_declined", "pilot_cta_selected", "result_action_selected", "journey_completed", "borrow_nudge_selected", "month_end_position_selected", "illustrative_example_viewed", "what_if_started", "what_if_completed", "otp_requested", "pilot_consent_recorded", "marketing_consent_recorded", "mobile_entry_started"]) {
      expect(types).not.toContain(legacy);
    }
  });
});

describe("isolation from the legacy flow", () => {
  const dir = __dirname;
  const newFiles = [
    "BorrowJourney.tsx",
    "borrowApi.ts",
    "journeyState.ts",
    "format.ts",
    "syntheticExample.ts",
    "useEmiPreview.ts",
    "borrowExample.ts",
    "borrowSummary.ts",
    "borrowInsight.ts",
    "borrowTenureExplorer.ts",
    "borrowBetterStructureExample.ts",
    ...readdirSync(join(dir, "steps")).map((name) => join("steps", name)),
  ];

  it("does not import the legacy page, the legacy continuation flow or shared 1.0 styles", () => {
    for (const file of newFiles) {
      const source = readFileSync(join(dir, file), "utf8");
      expect(source, file).not.toMatch(/Track11Flow|LegacyBorrowBetterPage|formState|QuickCheckUI|styles\.css|from "\.\.\/\.\.\/lib\/journeySession".*track11b/);
    }
  });

  it("contains no independent frontend rate literal or finance formula", () => {
    for (const file of newFiles.filter((name) => name.endsWith(".ts") || name.endsWith(".tsx"))) {
      const source = readFileSync(join(dir, file), "utf8").replace(/\/\*[\s\S]*?\*\//g, "").replace(/\/\/.*$/gm, "");
      expect(source, file).not.toMatch(/Math\.pow|\*\*|\(\s*1\s*\+|monthlyRate|estimate_?emi/i);
    }
  });
});

const EXAMPLE_BANNER = "Example mode — these are sample figures, not your data.";

async function useExample(user: User) {
  await user.click(screen.getByRole("tab", { name: "Try an example" }));
  await user.click(screen.getByRole("button", { name: "Use these example values" }));
}

describe("Branded frame and progress", () => {
  it("shows the Sutriva logo and step progress on every step", async () => {
    const user = userEvent.setup();
    const { container } = render(<BorrowJourney />);
    const header = () => container.querySelector("header") as HTMLElement;
    expect(within(header()).getByText("Sutriva")).toBeInTheDocument();
    expect(header().querySelector("svg")).not.toBeNull();
    expect(header()).toHaveTextContent("Step 2 of 5");
    await completeStep2(user);
    expect(header()).toHaveTextContent("Step 3 of 5");
    await completeStep3(user);
    expect(header()).toHaveTextContent("Step 4 of 5");
    await user.click(screen.getByRole("button", { name: "See a connected-data example" }));
    await screen.findByRole("heading", { name: "Your figures at a glance" });
    expect(header()).toHaveTextContent("Step 5 of 5");
    expect(within(header()).getByText("Sutriva")).toBeInTheDocument();
  });
});

describe("Indian digit grouping", () => {
  it("groups rupee inputs as the customer types, keeps the raw digits, and never lets a blank become zero", async () => {
    const user = userEvent.setup();
    render(<BorrowJourney />);
    const income = screen.getByLabelText("Monthly take-home income");
    await user.type(income, "1234567");
    expect(income).toHaveValue("12,34,567");
    await user.clear(income);
    expect(income).toHaveValue("");
    await user.type(income, "abc12.5x");
    expect(income).toHaveValue("12.5");
  });
});

describe("Example mode", () => {
  it("offers Enter my values by default and previews the sample without touching the form", async () => {
    const user = userEvent.setup();
    render(<BorrowJourney />);
    expect(screen.getByRole("tab", { name: "Enter my values" })).toHaveAttribute("aria-selected", "true");
    expect(screen.queryByText(EXAMPLE_BANNER)).toBeNull();

    await user.click(screen.getByRole("tab", { name: "Try an example" }));
    const preview = screen.getByRole("tabpanel");
    expect(preview).toHaveTextContent("₹1,20,000");
    expect(preview).toHaveTextContent("₹5,00,000");
    expect(within(preview).getByRole("button", { name: "Use these example values" })).toBeInTheDocument();
    expect(screen.getByLabelText("Monthly take-home income")).toHaveValue("");
    expect(screen.getByLabelText("Housing")).toHaveValue("");
    expect(screen.queryByText(EXAMPLE_BANNER)).toBeNull();
    expect(screen.queryByText("Example values edited")).toBeNull();
  });

  it("fills Steps 2 and 3 from one dataset, shows the banner, and marks any edit", async () => {
    const user = userEvent.setup();
    render(<BorrowJourney />);
    await useExample(user);

    expect(screen.getByRole("status")).toHaveTextContent(EXAMPLE_BANNER);
    expect(screen.queryByText("Example values edited")).toBeNull();
    expect(screen.getByLabelText("Monthly take-home income")).toHaveValue("1,20,000");
    expect(screen.getByLabelText("Existing loan and card payments")).toHaveValue("18,000");
    expect(screen.getByLabelText("Housing")).toHaveValue("28,000");
    expect(screen.getByLabelText("Household and utilities")).toHaveValue("11,000");
    expect(screen.getByLabelText("Dependants and education")).toHaveValue("12,000");
    expect(screen.getByLabelText("Recurring medical or insurance")).toHaveValue("6,000");
    expect(screen.getByRole("radio", { name: "Usually have money left" })).toBeChecked();
    expect(screen.getByText("Left after commitments & essentials").parentElement).toHaveTextContent("₹45,000");

    await user.click(screen.getByRole("button", { name: "Continue" }));
    await screen.findByRole("heading", { name: "Your borrowing plan" });
    expect(screen.getByRole("status")).toHaveTextContent(EXAMPLE_BANNER);
    expect(screen.getByLabelText("Loan amount")).toHaveValue("5,00,000");
    expect(screen.getByLabelText("Tenure")).toHaveValue("36");
    expect(screen.getByLabelText(/^Purpose/)).toHaveValue("home_improvement");
    expect(screen.getByRole("radio", { name: "No" })).toBeChecked();
    expect(await screen.findByText("₹17,089")).toBeInTheDocument();

    await user.type(screen.getByLabelText("Loan amount"), "0");
    expect(screen.getByText("Example values edited")).toBeInTheDocument();
    expect(screen.getByRole("status")).toHaveTextContent(EXAMPLE_BANNER);
  });

  it("marks an edit made on Step 2 and drops the mark when the value returns to the sample", async () => {
    const user = userEvent.setup();
    render(<BorrowJourney />);
    await useExample(user);
    const housing = screen.getByLabelText("Housing");
    await user.type(housing, "1");
    expect(screen.getByText("Example values edited")).toBeInTheDocument();
    await user.type(housing, "{Backspace}");
    expect(screen.queryByText("Example values edited")).toBeNull();
  });

  it("clears the example, returns to Step 2 and leaves every field empty", async () => {
    const user = userEvent.setup();
    render(<BorrowJourney />);
    await useExample(user);
    await user.click(screen.getByRole("button", { name: "Continue" }));
    await screen.findByRole("heading", { name: "Your borrowing plan" });

    await user.click(screen.getByRole("button", { name: "Clear example and enter my values" }));
    await screen.findByRole("heading", { name: "Your monthly position" });
    expect(screen.queryByText(EXAMPLE_BANNER)).toBeNull();
    expect(screen.getByRole("tab", { name: "Enter my values" })).toHaveAttribute("aria-selected", "true");
    expect(screen.getByLabelText("Monthly take-home income")).toHaveValue("");
    expect(screen.getByLabelText("Housing")).toHaveValue("");
    for (const radio of screen.getAllByRole("radio")) expect(radio).not.toBeChecked();

    await user.type(screen.getByLabelText("Monthly take-home income"), "50000");
    expect(screen.queryByText("Example values edited")).toBeNull();
  });

  it("sends the sample as the request and carries the same dataset through Steps 4 and 5", async () => {
    const user = userEvent.setup();
    render(<BorrowJourney />);
    await useExample(user);
    await user.click(screen.getByRole("button", { name: "Continue" }));
    await screen.findByRole("heading", { name: "Your borrowing plan" });
    await user.click(screen.getByRole("button", { name: "Continue" }));
    await screen.findByRole("heading", { name: "Your Borrow Better check" });

    expect(checkCalls()[0].body).toEqual({
      calculation_mode: "track_11a_breakdown",
      monthly_income: 120000,
      existing_debt_payments: 18000,
      housing_rent: 28000,
      household_utilities: 11000,
      dependants_education: 12000,
      recurring_medical_insurance: 6000,
      desired_borrowing_amount: 500000,
      desired_tenure_months: 36,
      month_end_position: "money_left",
      loan_purpose: "home_improvement",
      existing_emi_ending_within_six_months: "no",
    });
    expect(screen.getByRole("status")).toHaveTextContent(EXAMPLE_BANNER);
    expect(screen.getByText("This loan would add about ₹17,089 to your monthly payments.")).toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: "See a connected-data example" }));
    await screen.findByRole("heading", { name: "Your figures at a glance" });
    expect(screen.getByRole("status")).toHaveTextContent(EXAMPLE_BANNER);
    const glance = screen.getByRole("region", { name: /Your monthly payment mix/ });
    expect(glance).toHaveTextContent("₹57,000");
    expect(glance).toHaveTextContent("₹18,000");
    expect(glance).toHaveTextContent("₹17,089");
    expect(glance).toHaveTextContent("₹27,911");
    expect(glance).toHaveTextContent("₹1,20,000");
  });
});

describe("Step 4 adds and corrections", () => {
  it("shows the exact EMI, repayment and interest as whole rupees, plus the headline and secondary actions", async () => {
    const user = userEvent.setup();
    render(<BorrowJourney />);
    await completeStep2(user);
    await completeStep3(user);
    expect(screen.getByText("₹17,089")).toBeInTheDocument();
    expect(screen.getByText("₹6,15,197")).toBeInTheDocument();
    expect(screen.getByText("₹1,15,197")).toBeInTheDocument();
    expect(screen.getByText("This loan would add about ₹17,089 to your monthly payments.")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Adjust loan amount or tenure" })).toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: "Adjust loan amount or tenure" }));
    expect(await screen.findByRole("heading", { name: "Your borrowing plan" })).toBeInTheDocument();
  });

  it("offers Change my figures, which returns to Step 2 with the entries kept", async () => {
    const user = userEvent.setup();
    render(<BorrowJourney />);
    await completeStep2(user);
    await completeStep3(user);
    await user.click(screen.getByRole("button", { name: "Change my figures" }));
    expect(await screen.findByRole("heading", { name: "Your monthly position" })).toBeInTheDocument();
    expect(screen.getByLabelText("Housing")).toHaveValue("28,000");
  });

  it("selects the situation the declared figures support, stating the room or shortfall plainly with no judgement word", async () => {
    // additional_borrowing: room stays positive after the EMI (referenceCheck's own breathing_room_after).
    cleanup();
    installFetch();
    const user1 = userEvent.setup();
    render(<BorrowJourney />);
    await completeStep2(user1);
    await completeStep3(user1);
    expect(screen.getByText("This loan would add about ₹17,089 to your monthly payments.")).toBeInTheDocument();

    // shortfall_from_emi: room was positive before this loan, but this EMI takes it negative.
    cleanup();
    installFetch();
    checkResponse = () => okResponse({ ...referenceCheck, breathing_room_after: -1000 });
    const user2 = userEvent.setup();
    render(<BorrowJourney />);
    await completeStep2(user2);
    await completeStep3(user2);
    expect(
      screen.getByText("The proposed EMI of ₹17,089/month is ₹1,000/month more than your available room of ₹45,000/month, based on the figures entered."),
    ).toBeInTheDocument();

    // shortfall_before_loan: room was already negative before this loan — outranks the routine reading.
    cleanup();
    installFetch();
    checkResponse = () => okResponse({ ...referenceCheck, breathing_room_before: -5000, breathing_room_after: -22089 });
    const user3 = userEvent.setup();
    render(<BorrowJourney />);
    await completeStep2(user3);
    await completeStep3(user3);
    expect(screen.getByText("You're already short by about ₹5,000 a month before this loan, based on what you've told us.")).toBeInTheDocument();
  });

  it("never mentions a later phase: no pilot, mobile number, OTP, consent or connection on any step", async () => {
    const user = userEvent.setup();
    render(<BorrowJourney />);
    const forbidden = /pilot|mobile number|OTP|Twilio|consent|connect (my|your)? ?(bank|account|bureau)|upload (a )?statement|Step 6/i;
    for (const check of [async () => {}, async () => completeStep2(user), async () => completeStep3(user), async () => {
      await user.click(screen.getByRole("button", { name: "See a connected-data example" }));
      await screen.findByRole("heading", { name: "Your figures at a glance" });
    }]) {
      await check();
      expect(document.body.textContent ?? "").not.toMatch(forbidden);
    }
  });
});

describe("Example mode analytics", () => {
  it("emits the same six events with only a screen name, and no sample values", async () => {
    const user = userEvent.setup();
    render(<BorrowJourney />);
    await useExample(user);
    await user.click(screen.getByRole("button", { name: "Continue" }));
    await screen.findByRole("heading", { name: "Your borrowing plan" });
    await user.click(screen.getByRole("button", { name: "Continue" }));
    await screen.findByRole("heading", { name: "Your Borrow Better check" });
    await user.click(screen.getByRole("button", { name: "See a connected-data example" }));
    await screen.findByRole("heading", { name: "Your figures at a glance" });

    expect(trackEventMock.mock.calls.map(([type, , details]) => [type, details?.screenName])).toEqual([
      ["step_viewed", "borrow_monthly_position"],
      ["step_completed", "borrow_monthly_position"],
      ["step_viewed", "borrow_plan"],
      ["step_completed", "borrow_plan"],
      ["result_declared", "borrow_check"],
      ["connected_example_seen", "borrow_connected_example"],
    ]);
    const serialised = JSON.stringify(trackEventMock.mock.calls);
    expect(serialised).not.toMatch(/120000|500000|home_improvement|money_left|Example mode/i);
  });
});
