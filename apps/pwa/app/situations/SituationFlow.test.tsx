import { cleanup, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it, vi } from "vitest";

const { trackEventMock } = vi.hoisted(() => ({ trackEventMock: vi.fn() }));

vi.mock("../../lib/api", () => ({
  requireApiBaseUrl: () => "http://127.0.0.1:8010",
  trackEvent: trackEventMock,
}));

import { SituationFlow } from "./SituationFlow";

function mockFetchOnce(body: unknown, ok = true) {
  global.fetch = vi.fn().mockResolvedValue({ ok, status: ok ? 200 : 422, json: async () => body }) as unknown as typeof fetch;
}

async function goToInputs(user: ReturnType<typeof userEvent.setup>) {
  await user.click(screen.getByRole("button", { name: "Try this check →" }));
  await screen.findByRole("button", { name: "See the result →" });
}

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
  trackEventMock.mockReset();
});

describe("SituationFlow — Loan offer (lead path)", () => {
  const LOAN_OFFER_RESULT = {
    title: "What sits behind the EMI",
    headline: "₹2,56,000 estimated interest",
    detail: "₹10,56,000 scheduled repayment over 48 months on ₹8,00,000 principal",
    insight: "Estimated implied annualised reducing-balance rate from these entries: about 14.3% p.a. This is not the lender's disclosed APR or effective rate. Monthly room after this EMI: ₹13,000.",
    scenario: "An EMI ₹5,000 lower would change monthly room to ₹18,000.",
    note: "Calculated from the amount, EMI and tenure entered.",
    bars: [
      { label: "Principal", value: 800000, tone: "net" },
      { label: "Estimated interest", value: 256000, tone: "interest" },
    ],
  };

  it("shows the arrival question, then the example result with the illustrative badge", async () => {
    mockFetchOnce(LOAN_OFFER_RESULT);
    const user = userEvent.setup();
    render(<SituationFlow situationKey="offer" onExit={vi.fn()} />);

    expect(screen.getByRole("heading", { name: "What does this offer really cost?" })).toBeInTheDocument();
    await goToInputs(user);
    await user.click(screen.getByRole("button", { name: "See the result →" }));

    expect(await screen.findByText("₹2,56,000 estimated interest")).toBeInTheDocument();
    expect(screen.getByRole("note")).toHaveTextContent("ILLUSTRATIVE EXAMPLE — NOT YOUR DATA");
    expect(screen.getByText(/not the lender's disclosed APR/)).toBeInTheDocument();
  });

  it("editing one field before submitting shows the mixed-provenance label, not the example or own-data one", async () => {
    mockFetchOnce(LOAN_OFFER_RESULT);
    const user = userEvent.setup();
    render(<SituationFlow situationKey="offer" onExit={vi.fn()} />);
    await goToInputs(user);

    const emiField = screen.getByLabelText("Monthly EMI offered");
    await user.clear(emiField);
    await user.type(emiField, "25000");
    await user.click(screen.getByRole("button", { name: "See the result →" }));

    expect(await screen.findByText("EXAMPLE FIGURES + YOUR EDITS — PARTLY YOUR DATA")).toBeInTheDocument();
    expect(screen.queryByText("BASED ON WHAT YOU TOLD US — YOUR DECLARED FIGURES")).not.toBeInTheDocument();
    expect(screen.queryByText("ILLUSTRATIVE EXAMPLE — NOT YOUR DATA")).not.toBeInTheDocument();
  });

  it("Use my figures clears every field and requires real entry before the own-data label appears", async () => {
    mockFetchOnce(LOAN_OFFER_RESULT);
    const user = userEvent.setup();
    render(<SituationFlow situationKey="offer" onExit={vi.fn()} />);
    await goToInputs(user);

    await user.click(screen.getByRole("button", { name: "Use my figures" }));
    expect((screen.getByLabelText("Monthly EMI offered") as HTMLInputElement).value).toBe("");

    for (const [label, value] of [
      ["Loan amount offered", "800000"],
      ["Monthly EMI offered", "22000"],
      ["Tenure in months", "48"],
      ["Monthly take-home income", "95000"],
      ["Current EMIs and essential spending", "60000"],
    ] as const) {
      await user.type(screen.getByLabelText(label), value);
    }
    await user.click(screen.getByRole("button", { name: "See the result →" }));

    expect(await screen.findByText("BASED ON WHAT YOU TOLD US — YOUR DECLARED FIGURES")).toBeInTheDocument();
  });

  it("surfaces the backend's own validation message for an inconsistent entry, without submitting a second time silently", async () => {
    mockFetchOnce({ detail: "Check the offer amount, EMI and whole-month tenure; these payments must cover the principal." }, false);
    const user = userEvent.setup();
    render(<SituationFlow situationKey="offer" onExit={vi.fn()} />);
    await goToInputs(user);
    await user.click(screen.getByRole("button", { name: "See the result →" }));

    expect(await screen.findByText(/these payments must cover the principal/)).toBeInTheDocument();
  });

  it("never sends a raw financial value in a tracked analytics event", async () => {
    mockFetchOnce(LOAN_OFFER_RESULT);
    const user = userEvent.setup();
    render(<SituationFlow situationKey="offer" onExit={vi.fn()} />);
    await goToInputs(user);
    await user.click(screen.getByRole("button", { name: "See the result →" }));
    await screen.findByText("₹2,56,000 estimated interest");

    for (const call of trackEventMock.mock.calls) {
      const details = call[2] ?? {};
      expect(Object.keys(details).sort()).toEqual(["journeyRunId", "screenName"]);
      expect(JSON.stringify(details)).not.toMatch(/800000|22000|95000/);
    }
  });

  it("Adjust figures returns to the inputs screen with the previous entries kept", async () => {
    mockFetchOnce(LOAN_OFFER_RESULT);
    const user = userEvent.setup();
    render(<SituationFlow situationKey="offer" onExit={vi.fn()} />);
    await goToInputs(user);
    await user.click(screen.getByRole("button", { name: "See the result →" }));
    await screen.findByText("₹2,56,000 estimated interest");

    await user.click(screen.getByRole("button", { name: "Adjust figures" }));
    expect((screen.getByLabelText("Monthly EMI offered") as HTMLInputElement).value).toBe("22000");
  });
});

describe("SituationFlow — Annual fee (lead path)", () => {
  const FEE_RESULT = {
    title: "This year's redeemed value versus fee",
    headline: "Ahead by ₹1,200",
    detail: "₹4,200 redeemed rewards − ₹3,000 annual fee",
    insight: "You also entered ₹1,500 interest. Cancelling the card would not erase interest already charged. This is not a keep, cancel or upgrade recommendation.",
    scenario: "If the fee were waived, redeemed value minus fee would be ₹4,200.",
    note: "Based on redeemed value you entered; unused points are excluded.",
    bars: [
      { label: "Redeemed rewards", value: 4200, tone: "rewards" },
      { label: "Annual fee", value: 3000, tone: "fee" },
    ],
  };

  it("never implies cancelling the card erases interest, and is never a recommendation", async () => {
    mockFetchOnce(FEE_RESULT);
    const user = userEvent.setup();
    render(<SituationFlow situationKey="fee" onExit={vi.fn()} />);
    await goToInputs(user);
    await user.click(screen.getByRole("button", { name: "See the result →" }));

    expect(await screen.findByText(/would not erase interest/)).toBeInTheDocument();
    expect(screen.getByText(/not a keep, cancel or upgrade recommendation/)).toBeInTheDocument();
  });

  it("the optional interest field can be left blank and is not invented", async () => {
    mockFetchOnce({ ...FEE_RESULT, insight: "Interest was not entered; it is separate from this fee comparison. This is not a keep, cancel or upgrade recommendation." });
    const user = userEvent.setup();
    render(<SituationFlow situationKey="fee" onExit={vi.fn()} />);
    await goToInputs(user);

    const interestField = screen.getByLabelText(/Interest paid this year/);
    await user.clear(interestField);
    await user.click(screen.getByRole("button", { name: "See the result →" }));

    expect(await screen.findByText(/was not entered/)).toBeInTheDocument();
  });

  it("Explore another situation exits back to the landing", async () => {
    mockFetchOnce(FEE_RESULT);
    const onExit = vi.fn();
    const user = userEvent.setup();
    render(<SituationFlow situationKey="fee" onExit={onExit} />);
    await goToInputs(user);
    await user.click(screen.getByRole("button", { name: "See the result →" }));
    await screen.findByText("Ahead by ₹1,200");

    await user.click(screen.getByRole("button", { name: "Explore another situation" }));
    expect(onExit).toHaveBeenCalledTimes(1);
  });
});

describe("SituationFlow — the post-result pilot-interest email handoff", () => {
  const DEBT_RESULT = {
    title: "Monthly room after current commitments",
    headline: "₹8,000",
    detail: "detail",
    insight: "insight",
    scenario: "scenario",
    note: "note",
    bars: [],
  };

  it("does not appear before a result, and once shown has no checkbox, mobile field or OTP mention", async () => {
    mockFetchOnce(DEBT_RESULT);
    const user = userEvent.setup();
    render(<SituationFlow situationKey="debt" onExit={vi.fn()} />);

    expect(screen.queryByRole("heading", { name: "Interested in the Sutriva pilot?" })).not.toBeInTheDocument();
    await goToInputs(user);
    expect(screen.queryByRole("heading", { name: "Interested in the Sutriva pilot?" })).not.toBeInTheDocument();
    expect(screen.queryByLabelText("Email address")).not.toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: "See the result →" }));
    await screen.findByText("₹8,000");

    expect(screen.queryByRole("checkbox")).not.toBeInTheDocument();
    expect(screen.queryByLabelText(/mobile/i)).not.toBeInTheDocument();
    expect(screen.queryByText(/\bOTP\b/)).not.toBeInTheDocument();
    expect(screen.getByRole("heading", { name: "Interested in the Sutriva pilot?" })).toBeInTheDocument();
    expect(screen.getByText(/We're building a deeper version of this check/)).toBeInTheDocument();
    expect(screen.getByLabelText("Email address")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Register my interest" })).toBeInTheDocument();
  });

  it("finishing or exploring another situation works without ever entering an email", async () => {
    mockFetchOnce(DEBT_RESULT);
    const onExit = vi.fn();
    const user = userEvent.setup();
    render(<SituationFlow situationKey="debt" onExit={onExit} />);
    await goToInputs(user);
    await user.click(screen.getByRole("button", { name: "See the result →" }));
    await screen.findByText("₹8,000");

    expect(screen.getByLabelText("Email address") as HTMLInputElement).toHaveValue("");
    await user.click(screen.getByRole("button", { name: "Explore another situation" }));
    expect(onExit).toHaveBeenCalledTimes(1);
  });

  it("a valid email persists exactly once and shows the exact agreed confirmation, with no figures in the request", async () => {
    const FEE_RESULT = {
      title: "This year's redeemed value versus fee",
      headline: "Ahead by ₹1,200",
      detail: "detail",
      insight: "insight",
      scenario: "scenario",
      note: "note",
      bars: [],
    };
    let pilotInterestCalls = 0;
    let lastPilotInterestBody: unknown = null;
    global.fetch = vi.fn((url: string, init?: RequestInit) => {
      if (String(url).includes("/v1/situation-pilot-interest")) {
        pilotInterestCalls += 1;
        lastPilotInterestBody = init?.body ? JSON.parse(String(init.body)) : null;
        return Promise.resolve({ ok: true, status: 200, json: async () => ({ status: "registered" }) });
      }
      return Promise.resolve({ ok: true, status: 200, json: async () => FEE_RESULT });
    }) as unknown as typeof fetch;

    const user = userEvent.setup();
    render(<SituationFlow situationKey="fee" onExit={vi.fn()} />);
    await goToInputs(user);
    await user.click(screen.getByRole("button", { name: "See the result →" }));
    await screen.findByText("Ahead by ₹1,200");

    await user.type(screen.getByLabelText("Email address"), "visitor@example.com");
    await user.click(screen.getByRole("button", { name: "Register my interest" }));

    expect(await screen.findByText("Thanks — we've registered your interest. We'll email you when the Sutriva pilot is ready.")).toBeInTheDocument();
    expect(pilotInterestCalls).toBe(1);
    expect(lastPilotInterestBody).toEqual({ situation_key: "fee", email: "visitor@example.com" });
  });

  it("an invalid email shows an inline error and never shows success", async () => {
    mockFetchOnce(DEBT_RESULT);
    const user = userEvent.setup();
    render(<SituationFlow situationKey="debt" onExit={vi.fn()} />);
    await goToInputs(user);
    await user.click(screen.getByRole("button", { name: "See the result →" }));
    await screen.findByText("₹8,000");

    await user.type(screen.getByLabelText("Email address"), "not-an-email");
    await user.click(screen.getByRole("button", { name: "Register my interest" }));

    expect(await screen.findByText("Enter a valid email address.")).toBeInTheDocument();
    expect(screen.queryByText(/we've registered your interest/i)).not.toBeInTheDocument();
  });

  it("a server failure on submit shows an error, not the success confirmation", async () => {
    global.fetch = vi.fn((url: string) => {
      if (String(url).includes("/v1/situation-pilot-interest")) {
        return Promise.resolve({ ok: false, status: 503, json: async () => ({ detail: "service_unavailable" }) });
      }
      return Promise.resolve({ ok: true, status: 200, json: async () => DEBT_RESULT });
    }) as unknown as typeof fetch;

    const user = userEvent.setup();
    render(<SituationFlow situationKey="debt" onExit={vi.fn()} />);
    await goToInputs(user);
    await user.click(screen.getByRole("button", { name: "See the result →" }));
    await screen.findByText("₹8,000");

    await user.type(screen.getByLabelText("Email address"), "visitor@example.com");
    await user.click(screen.getByRole("button", { name: "Register my interest" }));

    expect(await screen.findByRole("alert")).toHaveTextContent("We couldn't save that just now. Please try again in a moment.");
    expect(screen.queryByText(/we've registered your interest/i)).not.toBeInTheDocument();
  });
});
