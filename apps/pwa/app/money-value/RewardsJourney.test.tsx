import { cleanup, render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const { ensureAnonymousSessionMock, trackEventMock } = vi.hoisted(() => ({
  ensureAnonymousSessionMock: vi.fn(),
  trackEventMock: vi.fn(),
}));

vi.mock("../../lib/api", () => ({
  ensureAnonymousSession: ensureAnonymousSessionMock,
  requireApiBaseUrl: () => "http://127.0.0.1:8010",
  trackEvent: trackEventMock,
}));

type User = ReturnType<typeof userEvent.setup>;

function apiResult(overrides: Record<string, unknown> = {}) {
  return {
    policy_version: "alpha50-money-value-v0.1",
    reward_type: "cashback",
    reward_input_basis: "cashback_amount",
    reward_period: "monthly",
    reward_amount_per_period: 900,
    reward_units_per_period: null,
    annualized_reward_units: null,
    annual_spend: 300000,
    estimated_annual_rewards: 10800,
    annual_card_fee: 4000,
    interest_input_basis: "no_balance",
    interest_value_known: true,
    estimated_annual_interest_cost: 0,
    estimated_net_annual_value: 6800,
    reward_value_known: true,
    unknown_value_reason: null,
    value_status: "POSITIVE",
    reason_codes: ["NET_VALUE_POSITIVE"],
    next_best_action: "Do this first | Then do that",
    guidance_disclaimer: "This is an indicative money-value estimate. It is not a card recommendation, product offer, or financial advice.",
    spending_priorities: ["dining", "travel"],
    spending_fit_status: "CATEGORY_FIT_UNDETERMINED",
    main_pressure_code: "FEE_REDUCES_VALUE",
    nudge_code: "COMPARE_REWARDS_FEE_INTEREST",
    audit_event_id: "evt",
    audit_event: {},
    ...overrides,
  };
}

function mockFetchOk(overrides: Record<string, unknown> = {}) {
  const fetchMock = vi.fn().mockResolvedValue({ ok: true, json: async () => apiResult(overrides) });
  global.fetch = fetchMock as unknown as typeof fetch;
  return fetchMock;
}

function requestBody(fetchMock: ReturnType<typeof vi.fn>, call = 0): Record<string, unknown> {
  return JSON.parse((fetchMock.mock.calls[call][1] as { body: string }).body);
}

const REWARD_TYPE_HELPER = "If your card offers several types, choose the one you use most. You can run another check for a different reward.";
const balanceGroup = () => screen.getByRole("group", { name: "Do you pay the full statement balance?" });
const rewardTypeGroup = () => screen.getByRole("group", { name: "Which reward type do you want to assess?" });

async function renderJourney(): Promise<User> {
  const { RewardsJourney } = await import("./RewardsJourney");
  const user = userEvent.setup();
  render(<RewardsJourney />);
  await screen.findByRole("heading", { name: "Your card behaviour" });
  await waitFor(() => expect(screen.getByRole("button", { name: "Continue" })).toBeEnabled());
  return user;
}

async function completeStep2(user: User, balance = "Pay in full each month", reward = "Cashback") {
  await user.click(within(balanceGroup()).getByRole("radio", { name: balance }));
  await user.click(within(rewardTypeGroup()).getByRole("radio", { name: reward }));
  await user.click(screen.getByRole("button", { name: "Continue" }));
  await screen.findByRole("heading", { name: "Your priorities and inputs" });
  await waitFor(() => expect(screen.getByRole("button", { name: "Check my rewards" })).toBeEnabled());
}

async function fillBasics(user: User, priorities: string[] = ["Dining", "Travel"], spend = "25000", fee = "4000") {
  for (const name of priorities) await user.click(screen.getByRole("checkbox", { name }));
  await user.type(screen.getByLabelText("Monthly card spend"), spend);
  await user.type(screen.getByLabelText("Annual card fee"), fee);
}

async function fillCashback(user: User, amount = "900", period = "monthly") {
  await user.type(screen.getByLabelText("Cashback received"), amount);
  await user.selectOptions(screen.getByLabelText("Period"), period);
}

async function submitStep3(user: User) {
  await user.click(screen.getByRole("button", { name: "Check my rewards" }));
  await screen.findByRole("heading", { name: "Your Rewards Check" });
}

async function runToStep4(user: User, balance = "Pay in full each month") {
  await completeStep2(user, balance);
  await fillBasics(user);
  await fillCashback(user);
  await submitStep3(user);
}

async function goToStep5(user: User) {
  await user.click(screen.getByRole("button", { name: /See a connected-data example/ }));
  await screen.findByRole("heading", { name: "Your figures at a glance" });
}

const emitted = () => trackEventMock.mock.calls.map(([type, , details]) => [type, details?.screenName]);

describe("Rewards Intelligence 1.1A steps 2-5", () => {
  beforeEach(() => {
    ensureAnonymousSessionMock.mockReset();
    ensureAnonymousSessionMock.mockResolvedValue(undefined);
    trackEventMock.mockReset();
    window.sessionStorage.clear();
    window.localStorage.clear();
    window.history.replaceState(null, "");
    mockFetchOk();
  });

  afterEach(() => {
    cleanup();
    vi.restoreAllMocks();
  });

  // --- Step 2 ------------------------------------------------------------------------------

  describe("Step 2: Your card behaviour", () => {
    it("shows the exact choices and preselects nothing", async () => {
      await renderJourney();

      const balance = within(balanceGroup()).getAllByRole("radio").map((radio) => (radio as HTMLInputElement).value);
      const rewards = within(rewardTypeGroup()).getAllByRole("radio").map((radio) => (radio as HTMLInputElement).value);
      expect(balance).toEqual(["pay_in_full", "carry_balance", "not_sure"]);
      expect(rewards).toEqual(["cashback", "points", "miles", "not_sure"]);
      expect(within(balanceGroup()).getByRole("radio", { name: "Pay in full each month" })).toBeInTheDocument();
      expect(within(balanceGroup()).getByRole("radio", { name: "Carry a balance" })).toBeInTheDocument();
      expect(within(rewardTypeGroup()).getByRole("radio", { name: "Miles" })).toBeInTheDocument();
      expect(screen.getByText("This helps us understand your situation.")).toBeInTheDocument();

      const radios = screen.getAllByRole("radio");
      expect(radios).toHaveLength(7);
      radios.forEach((radio) => expect(radio).not.toBeChecked());
    });

    it("collects no financial input on this screen", async () => {
      await renderJourney();

      expect(screen.queryAllByRole("spinbutton")).toHaveLength(0);
      expect(screen.queryAllByRole("textbox")).toHaveLength(0);
      expect(screen.queryByLabelText(/balance carried|interest rate/i)).not.toBeInTheDocument();
    });

    it("requires an explicit choice in both questions before continuing", async () => {
      const user = await renderJourney();

      await user.click(screen.getByRole("button", { name: "Continue" }));
      const alert = await screen.findByRole("alert");
      expect(alert).toHaveTextContent("Choose how you pay your statement balance.");
      expect(alert).toHaveTextContent("Choose the reward type you want to assess.");
      expect(screen.getByRole("heading", { name: "Your card behaviour" })).toBeInTheDocument();

      await user.click(within(balanceGroup()).getByRole("radio", { name: "Not sure" }));
      await user.click(screen.getByRole("button", { name: "Continue" }));
      expect(screen.getByRole("alert")).toHaveTextContent("Choose the reward type you want to assess.");
      expect(screen.getByRole("heading", { name: "Your card behaviour" })).toBeInTheDocument();
      expect(emitted()).not.toContainEqual(["step_completed", "rewards_card_behaviour"]);
    });

    it("ties each unanswered question's inline error to its fieldset and clears it once answered", async () => {
      const user = await renderJourney();
      await user.click(screen.getByRole("button", { name: "Continue" }));

      expect(balanceGroup()).toHaveAccessibleDescription(/Choose how you pay your statement balance\./);
      expect(balanceGroup()).toHaveAttribute("aria-describedby", expect.stringContaining("rewards-balance-error"));
      expect(document.getElementById("rewards-balance-error")).toHaveTextContent("Choose how you pay your statement balance.");
      expect(rewardTypeGroup()).toHaveAccessibleDescription(/Choose the reward type you want to assess\./);
      expect(rewardTypeGroup()).toHaveAttribute("aria-describedby", expect.stringContaining("rewards-reward-type-error"));

      await user.click(within(balanceGroup()).getByRole("radio", { name: "Not sure" }));
      expect(document.getElementById("rewards-balance-error")).toBeNull();
      expect(balanceGroup()).toHaveAccessibleDescription("This helps us understand your situation.");
      expect(balanceGroup().getAttribute("aria-describedby")).not.toContain("rewards-balance-error");
      expect(rewardTypeGroup()).toHaveAttribute("aria-describedby", expect.stringContaining("rewards-reward-type-error"));
    });

    it("shows no inline choice errors before the first failed attempt", async () => {
      await renderJourney();
      expect(document.getElementById("rewards-balance-error")).toBeNull();
      expect(document.getElementById("rewards-reward-type-error")).toBeNull();
      expect(rewardTypeGroup()).toHaveAccessibleDescription(REWARD_TYPE_HELPER);
      expect(rewardTypeGroup().getAttribute("aria-describedby")).not.toContain("rewards-reward-type-error");
    });

    it("treats 'Not sure' as an explicit answer, distinct from unanswered", async () => {
      const user = await renderJourney();
      await completeStep2(user, "Not sure", "Not sure");
      expect(screen.getByRole("heading", { name: "Your priorities and inputs" })).toBeInTheDocument();
    });
  });

  // --- Step 3 ------------------------------------------------------------------------------

  describe("Step 3: Your priorities and inputs", () => {
    it("starts empty: no priorities, no prefilled numbers, no period", async () => {
      const user = await renderJourney();
      await completeStep2(user);

      const priorities = screen.getAllByRole("checkbox");
      expect(priorities.map((box) => box.getAttribute("value"))).toEqual(["dining", "travel", "grocery", "everyday_bills"]);
      priorities.forEach((box) => expect(box).not.toBeChecked());
      expect(screen.getByLabelText("Monthly card spend")).toHaveValue("");
      expect(screen.getByLabelText("Annual card fee")).toHaveValue("");
      expect(screen.getByLabelText("Cashback received")).toHaveValue("");
      expect(screen.getByLabelText("Period")).toHaveValue("");
      expect(screen.getByText("Select up to 3 categories.")).toBeInTheDocument();
      expect(screen.queryByRole("button", { name: "Use example values" })).not.toBeInTheDocument();
      expect(screen.queryByRole("slider")).not.toBeInTheDocument();
      expect(screen.queryByLabelText(/cashback percentage|reward rate/i)).not.toBeInTheDocument();
    });

    it("caps priorities at three and prevents a fourth accessibly", async () => {
      const user = await renderJourney();
      await completeStep2(user);

      for (const name of ["Dining", "Travel", "Grocery"]) await user.click(screen.getByRole("checkbox", { name }));

      expect(screen.getByRole("checkbox", { name: "Everyday bills" })).toBeDisabled();
      expect(screen.getByText("You have chosen 3. Clear one to choose another.")).toBeInTheDocument();
      expect(screen.getAllByRole("checkbox").filter((box) => (box as HTMLInputElement).checked)).toHaveLength(3);

      await user.click(screen.getByRole("checkbox", { name: "Dining" }));
      expect(screen.getByRole("checkbox", { name: "Everyday bills" })).toBeEnabled();
      await user.click(screen.getByRole("checkbox", { name: "Everyday bills" }));
      expect(screen.getByRole("checkbox", { name: "Everyday bills" })).toBeChecked();
    });

    it("requires at least one priority", async () => {
      const user = await renderJourney();
      await completeStep2(user);
      await user.type(screen.getByLabelText("Monthly card spend"), "25000");
      await user.type(screen.getByLabelText("Annual card fee"), "4000");
      await fillCashback(user);

      await user.click(screen.getByRole("button", { name: "Check my rewards" }));

      expect(await screen.findByRole("alert")).toHaveTextContent("Choose between 1 and 3 spending priorities.");
      expect(global.fetch).not.toHaveBeenCalled();
      expect(screen.getByRole("heading", { name: "Your priorities and inputs" })).toBeInTheDocument();

      const group = screen.getByRole("group", { name: "What are your top spending priorities?" });
      expect(group).toHaveAttribute("aria-describedby", expect.stringContaining("rewards-priorities-error"));
      expect(group).toHaveAccessibleDescription("Select up to 3 categories. Choose between 1 and 3 spending priorities.");

      await user.click(screen.getByRole("checkbox", { name: "Dining" }));
      expect(document.getElementById("rewards-priorities-error")).toBeNull();
      expect(group).toHaveAccessibleDescription("Select up to 3 categories.");
    });

    it("keeps blank and confirmed zero distinct", async () => {
      const fetchMock = mockFetchOk();
      const user = await renderJourney();
      await completeStep2(user);
      await user.click(screen.getByRole("checkbox", { name: "Grocery" }));
      await user.type(screen.getByLabelText("Annual card fee"), "0");
      await fillCashback(user, "0");

      await user.click(screen.getByRole("button", { name: "Check my rewards" }));
      const alert = await screen.findByRole("alert");
      expect(alert).toHaveTextContent("Enter your monthly card spend.");
      expect(alert).not.toHaveTextContent("Enter your annual card fee.");
      expect(alert).not.toHaveTextContent("Enter the reward amount.");
      expect(fetchMock).not.toHaveBeenCalled();

      await user.type(screen.getByLabelText("Monthly card spend"), "0");
      await submitStep3(user);

      const body = requestBody(fetchMock);
      expect(body.monthly_card_spend).toBe(0);
      expect(body.annual_card_fee).toBe(0);
      expect(body.cashback_amount).toBe(0);
    });

    it("requires a period when a reward amount is entered", async () => {
      const user = await renderJourney();
      await completeStep2(user);
      await fillBasics(user);
      await user.type(screen.getByLabelText("Cashback received"), "900");

      await user.click(screen.getByRole("button", { name: "Check my rewards" }));

      expect(await screen.findByRole("alert")).toHaveTextContent("Choose the period these rewards cover.");
      expect(global.fetch).not.toHaveBeenCalled();
    });

    it("sends the declared answers and priorities, and no legacy or invented fields", async () => {
      const fetchMock = mockFetchOk();
      const user = await renderJourney();
      await runToStep4(user);

      expect(fetchMock).toHaveBeenCalledTimes(1);
      expect(fetchMock.mock.calls[0][0]).toBe("http://127.0.0.1:8010/v1/financial-intelligence/money-value-check");
      expect(requestBody(fetchMock)).toEqual({
        monthly_card_spend: 25000,
        annual_card_fee: 4000,
        reward_type: "cashback",
        spending_priorities: ["dining", "travel"],
        balance_behavior: "pay_in_full",
        reward_period: "monthly",
        reward_input_basis: "cashback_amount",
        cashback_amount: 900,
      });
    });

    it("sends carry_balance without inventing a balance, rate or interest basis", async () => {
      const fetchMock = mockFetchOk({ interest_input_basis: "unknown", estimated_net_annual_value: null, estimated_annual_interest_cost: null, interest_value_known: false });
      const user = await renderJourney();
      await runToStep4(user, "Carry a balance");

      const body = requestBody(fetchMock);
      expect(body.balance_behavior).toBe("carry_balance");
      for (const key of ["revolving_balance", "annual_interest_rate_percent", "interest_input_basis", "interest_value_unknown"]) {
        expect(body).not.toHaveProperty(key);
      }
    });

    it("shows no reward inputs when the reward type is 'Not sure' and sends an explicit unknown", async () => {
      const fetchMock = mockFetchOk({ reward_type: "not_sure", reward_value_known: false, estimated_annual_rewards: null, estimated_net_annual_value: null, reward_period: null, reward_amount_per_period: null, main_pressure_code: "REWARD_VALUE_UNKNOWN" });
      const user = await renderJourney();
      await completeStep2(user, "Pay in full each month", "Not sure");

      expect(screen.queryByLabelText("Cashback received")).not.toBeInTheDocument();
      expect(screen.getByText(/we can’t estimate reward value yet/)).toBeInTheDocument();
      await fillBasics(user);
      await submitStep3(user);

      const body = requestBody(fetchMock);
      expect(body.reward_value_unknown).toBe(true);
      expect(body).not.toHaveProperty("cashback_amount");
      expect(body).not.toHaveProperty("reward_period");
    });

    it("supports points with an approximate rupee value, marked as an estimate", async () => {
      const fetchMock = mockFetchOk({ reward_type: "points" });
      const user = await renderJourney();
      await completeStep2(user, "Pay in full each month", "Points");
      await fillBasics(user);

      expect(screen.getByRole("group", { name: "What do you know about the points you earned?" })).toBeInTheDocument();
      expect(screen.getByRole("radio", { name: "The approximate ₹ value" })).not.toBeChecked();
      await user.click(screen.getByRole("radio", { name: "The approximate ₹ value" }));
      await user.type(screen.getByLabelText("Approximate reward value"), "500");
      await user.selectOptions(screen.getByLabelText("Period"), "quarterly");
      await submitStep3(user);

      expect(requestBody(fetchMock)).toMatchObject({
        reward_type: "points",
        reward_input_basis: "known_reward_value",
        reward_value_amount: 500,
        reward_period: "quarterly",
        reward_amount_is_estimate: true,
      });
    });

    it("keeps miles quantity-only and never sends or shows an invented rupee conversion", async () => {
      const fetchMock = mockFetchOk({
        reward_type: "miles",
        reward_input_basis: "earned_units",
        reward_period: "quarterly",
        reward_amount_per_period: null,
        reward_units_per_period: 1000,
        annualized_reward_units: 4000,
        estimated_annual_rewards: null,
        estimated_net_annual_value: null,
        reward_value_known: false,
        main_pressure_code: "REWARD_VALUE_UNKNOWN",
      });
      const user = await renderJourney();
      await completeStep2(user, "Pay in full each month", "Miles");
      await fillBasics(user);
      await user.click(screen.getByRole("radio", { name: "Only the points or miles quantity" }));
      await user.type(screen.getByLabelText("Miles earned in this period"), "1000");
      await user.selectOptions(screen.getByLabelText("Period"), "quarterly");
      expect(screen.getByText(/We won’t convert it to rupees/)).toBeInTheDocument();
      await submitStep3(user);

      const body = requestBody(fetchMock);
      expect(body).toMatchObject({ reward_input_basis: "earned_units", reward_units_earned: 1000, reward_value_unknown: true });
      expect(body).not.toHaveProperty("rupee_value_per_reward_unit");
      expect(body).not.toHaveProperty("reward_value_amount");
      expect(screen.getByText("Annualised quantity: 4,000 miles. We haven’t converted this to rupees.")).toBeInTheDocument();
      expect(screen.getByText("Based on 1,000 miles per quarter.")).toBeInTheDocument();
      expect(screen.getByText("Unknown")).toBeInTheDocument();
    });

    it("requires points and miles customers to say what they know", async () => {
      const user = await renderJourney();
      await completeStep2(user, "Pay in full each month", "Points");
      await fillBasics(user);

      await user.click(screen.getByRole("button", { name: "Check my rewards" }));

      expect(await screen.findByRole("alert")).toHaveTextContent("Tell us what you know about your rewards, or continue without a value.");
      expect(global.fetch).not.toHaveBeenCalled();
    });
  });

  // --- Reward finder -------------------------------------------------------------------------

  describe("Where to find your rewards", () => {
    async function openFinder(user: User) {
      const trigger = screen.getByRole("button", { name: /show me where to find it/ });
      await user.click(trigger);
      const dialog = await screen.findByRole("dialog", { name: "Where to find your rewards" });
      return { trigger, dialog };
    }

    it("opens as a labelled modal dialog with focus inside and the approved content", async () => {
      const user = await renderJourney();
      await completeStep2(user);
      const { dialog } = await openFinder(user);

      expect(dialog).toHaveAttribute("aria-modal", "true");
      expect(screen.getByRole("heading", { name: "Where to find your rewards" })).toHaveFocus();
      expect(within(dialog).getByText("Rewards or Benefits", { exact: false })).toBeInTheDocument();
      expect(within(dialog).getByText("Cashback, Rewards credit or Points balance", { exact: false })).toBeInTheDocument();
      expect(within(dialog).getByRole("button", { name: "I found it — enter amount" })).toBeInTheDocument();
      expect(within(dialog).getByRole("button", { name: "I know points/miles, not ₹ value" })).toBeInTheDocument();
      expect(within(dialog).getByRole("button", { name: "Continue without it" })).toBeInTheDocument();
    });

    it("closes on Escape and returns focus to the control that opened it", async () => {
      const user = await renderJourney();
      await completeStep2(user);
      const { trigger } = await openFinder(user);

      await user.keyboard("{Escape}");

      await waitFor(() => expect(screen.queryByRole("dialog")).not.toBeInTheDocument());
      expect(trigger).toHaveFocus();
    });

    it("closes with the Close button and keeps Tab inside the dialog", async () => {
      const user = await renderJourney();
      await completeStep2(user);
      const { trigger, dialog } = await openFinder(user);

      screen.getByRole("button", { name: "Continue without it" }).focus();
      await user.tab();
      expect(within(dialog).getByRole("button", { name: "Close" })).toHaveFocus();
      await user.tab({ shift: true });
      expect(screen.getByRole("button", { name: "Continue without it" })).toHaveFocus();

      await user.click(within(dialog).getByRole("button", { name: "Close" }));
      await waitFor(() => expect(screen.queryByRole("dialog")).not.toBeInTheDocument());
      expect(trigger).toHaveFocus();
    });

    it("'Continue without it' records an unknown reward value, closes, and allows progression", async () => {
      const fetchMock = mockFetchOk({ reward_value_known: false, estimated_annual_rewards: null, estimated_net_annual_value: null, reward_amount_per_period: null, reward_period: null, main_pressure_code: "REWARD_VALUE_UNKNOWN" });
      const user = await renderJourney();
      await completeStep2(user);
      await fillBasics(user);
      const { dialog } = await openFinder(user);

      await user.click(within(dialog).getByRole("button", { name: "Continue without it" }));

      await waitFor(() => expect(screen.queryByRole("dialog")).not.toBeInTheDocument());
      expect(screen.getByText(/continuing without a reward value/)).toBeInTheDocument();
      expect(screen.queryByLabelText("Cashback received")).not.toBeInTheDocument();
      await submitStep3(user);

      const body = requestBody(fetchMock);
      expect(body.reward_value_unknown).toBe(true);
      expect(body).not.toHaveProperty("cashback_amount");
      expect(screen.getByText("Reward value is unknown, so we can’t estimate annual rewards.")).toBeInTheDocument();
    });

    it("'I know points/miles, not ₹ value' moves to a quantity entry without any rupee estimate", async () => {
      const user = await renderJourney();
      await completeStep2(user);
      const { dialog } = await openFinder(user);

      await user.click(within(dialog).getByRole("button", { name: "I know points/miles, not ₹ value" }));

      expect(await screen.findByLabelText("Points earned in this period")).toBeInTheDocument();
      expect(screen.queryByLabelText("Cashback received")).not.toBeInTheDocument();
      expect(screen.queryByLabelText("Approximate reward value")).not.toBeInTheDocument();
    });

    it("'I found it' reveals the amount entry, even if the reward type was 'Not sure'", async () => {
      const user = await renderJourney();
      await completeStep2(user, "Pay in full each month", "Not sure");
      const { dialog } = await openFinder(user);

      await user.click(within(dialog).getByRole("button", { name: "I found it — enter amount" }));

      expect(await screen.findByLabelText("Cashback received")).toBeInTheDocument();
    });

    it("lets the customer undo 'continue without a value'", async () => {
      const user = await renderJourney();
      await completeStep2(user);
      const { dialog } = await openFinder(user);
      await user.click(within(dialog).getByRole("button", { name: "Continue without it" }));

      await user.click(await screen.findByRole("button", { name: "I’ll enter it instead" }));

      expect(await screen.findByLabelText("Cashback received")).toBeInTheDocument();
    });
  });

  // --- API failure ---------------------------------------------------------------------------

  describe("API failure", () => {
    it("keeps every input and stays on Step 3, then recovers on retry", async () => {
      const fetchMock = vi
        .fn()
        .mockResolvedValueOnce({ ok: false, json: async () => ({}) })
        .mockResolvedValueOnce({ ok: true, json: async () => apiResult() });
      global.fetch = fetchMock as unknown as typeof fetch;
      const user = await renderJourney();
      await completeStep2(user);
      await fillBasics(user);
      await fillCashback(user);

      await user.click(screen.getByRole("button", { name: "Check my rewards" }));

      expect(await screen.findByText("We couldn’t complete your rewards check.")).toBeInTheDocument();
      expect(screen.getByRole("heading", { name: "Your priorities and inputs" })).toBeInTheDocument();
      expect(screen.getByLabelText("Monthly card spend")).toHaveValue("25,000");
      expect(screen.getByLabelText("Annual card fee")).toHaveValue("4,000");
      expect(screen.getByLabelText("Cashback received")).toHaveValue("900");
      expect(screen.getByRole("checkbox", { name: "Dining" })).toBeChecked();
      expect(screen.getByRole("checkbox", { name: "Travel" })).toBeChecked();
      expect(screen.getByLabelText("Period")).toHaveValue("monthly");
      expect(emitted()).not.toContainEqual(["step_completed", "rewards_priorities_inputs"]);
      expect(emitted()).not.toContainEqual(["result_declared", "rewards_check"]);

      await submitStep3(user);
      expect(fetchMock).toHaveBeenCalledTimes(2);
      expect(screen.queryByText("We couldn’t complete your rewards check.")).not.toBeInTheDocument();
    });

    it("treats a network error the same way", async () => {
      global.fetch = vi.fn().mockRejectedValue(new TypeError("Failed to fetch")) as unknown as typeof fetch;
      const user = await renderJourney();
      await completeStep2(user);
      await fillBasics(user);
      await fillCashback(user);

      await user.click(screen.getByRole("button", { name: "Check my rewards" }));

      expect(await screen.findByText("We couldn’t complete your rewards check.")).toBeInTheDocument();
      expect(screen.queryByText("Failed to fetch")).not.toBeInTheDocument();
    });
  });

  // --- Step 4 --------------------------------------------------------------------------------

  describe("Step 4: Your Rewards Check", () => {
    it("renders the backend result as separate cards, with the visible basis", async () => {
      const user = await renderJourney();
      await runToStep4(user);

      expect(screen.getByText("Based on the information you provided. This is an indicative estimate.")).toBeInTheDocument();
      expect(screen.getByRole("heading", { name: /Rewards vs fee/ })).toBeInTheDocument();
      expect(screen.getByText("Estimated annual rewards").nextSibling).toHaveTextContent("₹10,800");
      expect(screen.getByText("Annual fee").nextSibling).toHaveTextContent("₹4,000");
      expect(screen.getByText("Net annual value").nextSibling).toHaveTextContent("₹6,800");
      expect(screen.getByText("Based on ₹900 cashback per month.")).toBeInTheDocument();
      expect(screen.getByText("No interest cost is included because you pay the statement balance in full.")).toBeInTheDocument();

      expect(screen.getByRole("heading", { name: "Your spending priorities" })).toBeInTheDocument();
      expect(screen.getByText("Dining")).toBeInTheDocument();
      expect(screen.getByText("Travel")).toBeInTheDocument();
      expect(screen.getByText("We can’t tell from the details you entered how well your card rewards these categories.")).toBeInTheDocument();
      // Situation-specific finding copy (why/try) sits alongside the backend's own main-pressure code;
      // the old generic "Our nudge" pairing is replaced by this situation-specific "try" copy.
      expect(screen.getByText("Paying in full each month means interest never applies to this card.")).toBeInTheDocument();
      expect(screen.getByText("None required — optionally, see how this changes if your fee is waived.")).toBeInTheDocument();
      expect(screen.getByRole("heading", { name: "Main pressure" })).toBeInTheDocument();
      expect(screen.getByText("Your annual fee reduces the value you get from your rewards.")).toBeInTheDocument();
      expect(screen.getByText(/not a card recommendation/)).toBeInTheDocument();
    });

    it("makes no category-fit claim and recommends no card", async () => {
      const user = await renderJourney();
      await runToStep4(user);

      expect(screen.queryByText(/may not fit|dining-heavy|better match|cards? that/i)).not.toBeInTheDocument();
      expect(screen.queryByText(/we recommend/i)).not.toBeInTheDocument();
    });

    it("never shows raw pipe-delimited backend text, the legacy status label, what-if or example values", async () => {
      const user = await renderJourney();
      await runToStep4(user);

      expect(screen.queryByText(/Do this first/)).not.toBeInTheDocument();
      expect(screen.queryByText(/\|/)).not.toBeInTheDocument();
      expect(screen.queryByText("Your card appears to create value")).not.toBeInTheDocument();
      expect(screen.queryByText(/what did we find/i)).not.toBeInTheDocument();
      expect(screen.queryByRole("slider")).not.toBeInTheDocument();
      expect(screen.queryByRole("button", { name: /Update estimate|Use example values|Check another card/ })).not.toBeInTheDocument();
    });

    it("preserves a valid negative net value", async () => {
      mockFetchOk({ annual_card_fee: 12000, estimated_net_annual_value: -1200, main_pressure_code: "FEE_EXCEEDS_REWARDS", value_status: "VALUE_LEAKAGE" });
      const user = await renderJourney();
      await runToStep4(user);

      expect(screen.getByText("Net annual value").nextSibling).toHaveTextContent("−₹1,200");
      expect(screen.getByText("Your annual fee is higher than the estimated annual rewards.")).toBeInTheDocument();
    });

    it("shows the known before-interest value for 'carry a balance' instead of a dead end, plus a separate fictional interest illustration", async () => {
      mockFetchOk({ interest_input_basis: "unknown", interest_value_known: false, estimated_annual_interest_cost: null, estimated_net_annual_value: null, main_pressure_code: "INTEREST_EFFECT_UNKNOWN", value_status: "UNKNOWN_VALUE" });
      const user = await renderJourney();
      await runToStep4(user, "Carry a balance");

      expect(screen.getByText("Estimated annual rewards").nextSibling).toHaveTextContent("₹10,800");
      // Rewards minus fee is known and shown, not withheld as "can't calculate" — the "dead end" this fixes.
      expect(screen.getByText("Net annual value").nextSibling).toHaveTextContent("₹6,800");
      expect(screen.getByText("Interest impact is unknown. No interest cost has been assumed.")).toBeInTheDocument();
      expect(screen.getByText("Before interest, your estimated net value is ₹6,800.")).toBeInTheDocument();
      // Never claims to know that the customer's own interest is "likely" or "usually" larger than their
      // rewards — we don't know their balance or APR, so that would compare a real figure with an unknown one.
      expect(screen.queryByText(/likely.*larger|usually.*larger than.*rewards/i)).toBeNull();
      // The separate, explicitly fictional illustration — never merged into or compared with the customer's own ₹6,800.
      expect(screen.getByText("Illustrative example — not your figures")).toBeInTheDocument();
      expect(screen.getByText(/₹10,000 balance/)).toBeInTheDocument();
      expect(screen.getByText(/₹3,000–₹4,200/)).toBeInTheDocument();
      expect(screen.getByText(/not a calculation of your own interest cost/)).toBeInTheDocument();
      // The redundant, now-contradictory "Main pressure" card is suppressed for this pressure code: the
      // situation copy above already explains that interest is unknown, without implying nothing is shown.
      expect(screen.queryByText("Interest impact is unknown, so we can’t show your net value after interest.")).toBeNull();
      expect(screen.queryByRole("heading", { name: "Main pressure" })).toBeNull();
      // "before interest" is now stated once, in a caption below the number — not repeated in a label
      // above it, and not appended inline where it caused a mobile wrapping issue.
      expect(screen.getByText("Estimate from your entries; excludes interest.")).toBeInTheDocument();
      expect((document.body.textContent ?? "").match(/before interest/gi) ?? []).toHaveLength(1);
    });

    it("shows an unknown reward value as unknown, not zero, with no chart until a value is entered", async () => {
      mockFetchOk({ reward_value_known: false, estimated_annual_rewards: null, estimated_net_annual_value: null, reward_amount_per_period: null, reward_period: null, main_pressure_code: "REWARD_VALUE_UNKNOWN" });
      const user = await renderJourney();
      await completeStep2(user, "Pay in full each month", "Not sure");
      await fillBasics(user);
      await submitStep3(user);

      expect(screen.getByText("Estimated annual rewards").nextSibling).toHaveTextContent("Unknown");
      expect(screen.getByText("Net annual value").nextSibling).toHaveTextContent("Can't calculate yet");
      expect(screen.getByText("We need a reward value to work out what your rewards are worth. We haven’t guessed one.")).toBeInTheDocument();
    });

    it("degrades safely if an older backend omits the new result codes", async () => {
      mockFetchOk({ spending_fit_status: undefined, main_pressure_code: undefined, nudge_code: undefined, spending_priorities: undefined });
      const user = await renderJourney();
      await runToStep4(user);

      expect(screen.getByRole("heading", { name: /Rewards vs fee/ })).toBeInTheDocument();
      expect(screen.queryByRole("heading", { name: "Main pressure" })).not.toBeInTheDocument();
      expect(screen.queryByRole("heading", { name: "Our nudge" })).not.toBeInTheDocument();
      expect(screen.queryByRole("heading", { name: "Your spending priorities" })).not.toBeInTheDocument();
    });

    it("moves to Step 5 only, via the approved call to action", async () => {
      const user = await renderJourney();
      await runToStep4(user);

      await user.click(screen.getByRole("button", { name: /See a connected-data example/ }));

      expect(await screen.findByRole("heading", { name: "Your figures at a glance" })).toBeInTheDocument();
      expect(screen.queryByRole("heading", { name: "Your Rewards Check" })).not.toBeInTheDocument();
    });
  });

  // --- Step 5 --------------------------------------------------------------------------------

  describe("Step 5: What your real data could reveal", () => {
    it("always shows the illustrative banner and the fixed synthetic example", async () => {
      const user = await renderJourney();
      await runToStep4(user);
      await goToStep5(user);

      expect(screen.getByRole("note")).toHaveTextContent("ILLUSTRATIVE EXAMPLE — NOT YOUR DATA");
      expect(screen.getByText("This fictional example shows what permissioned data could help analyse.")).toBeInTheDocument();
      // Plain language, not an invitation to connect now: this version doesn't.
      expect(screen.getByText("This version does not connect to your bank data.")).toBeInTheDocument();
      expect(screen.getByText("Example monthly spend mix")).toBeInTheDocument();
      expect(screen.getByText("₹25,000")).toBeInTheDocument();
      for (const [name, share] of [["Dining", "32%"], ["Travel", "18%"], ["Grocery", "22%"], ["Other", "28%"]]) {
        expect(screen.getByText(name).closest("li")).toHaveTextContent(share);
      }
      expect(screen.getByText("Possible fee drag")).toBeInTheDocument();
      expect(screen.getByText("Dining’s your largest category")).toBeInTheDocument();
      expect(screen.getByText("Interest may erase rewards")).toBeInTheDocument();
    });

    it("gives the chart a text alternative", async () => {
      const user = await renderJourney();
      await runToStep4(user);
      await goToStep5(user);

      expect(screen.getByRole("img", { name: "Example monthly spend mix, total ₹25,000: Dining 32%, Travel 18%, Grocery 22%, Other 28%." })).toBeInTheDocument();
    });

    it("never interpolates the customer's inputs into the illustrative panel", async () => {
      const user = await renderJourney();
      await completeStep2(user, "Carry a balance", "Points");
      await user.click(screen.getByRole("radio", { name: "The approximate ₹ value" }));
      await fillBasics(user, ["Everyday bills"], "77777", "3333");
      await user.type(screen.getByLabelText("Approximate reward value"), "4242");
      await user.selectOptions(screen.getByLabelText("Period"), "yearly");
      await submitStep3(user);
      await goToStep5(user);

      const text = screen.getByRole("region", { name: "What connected data could add" }).textContent ?? "";
      for (const leaked of ["77,777", "77777", "3,333", "3333", "4,242", "4242", "Everyday bills"]) {
        expect(text).not.toContain(leaked);
      }
      // The separate primary graphic is where the active dataset appears.
      expect(screen.getByRole("region", { name: /Rewards, fee and net value/ })).toHaveTextContent("Everyday bills");
    });

    it("shows no pilot call to action, disabled or otherwise, and no data-connection controls", async () => {
      const user = await renderJourney();
      await runToStep4(user);
      await goToStep5(user);

      expect(screen.queryByText(/join the pilot/i)).not.toBeInTheDocument();
      expect(screen.queryByText(/mobile number|OTP|verify/i)).not.toBeInTheDocument();
      expect(screen.queryByRole("checkbox")).not.toBeInTheDocument();
      expect(screen.queryByRole("textbox")).not.toBeInTheDocument();
      expect(screen.queryByText(/connect (your )?(account|bank|statement)|upload|bureau/i)).not.toBeInTheDocument();
      expect(screen.getAllByRole("button").map((button) => button.textContent)).toEqual(["Back"]);
      expect(screen.getByRole("link", { name: "Back to home" })).toHaveAttribute("href", "/");
    });

    it("does not imply a statement was connected", async () => {
      const user = await renderJourney();
      await runToStep4(user);
      await goToStep5(user);

      expect(screen.queryByText(/we (analysed|analyzed|found)|your statement (shows|has)/i)).not.toBeInTheDocument();
    });
  });

  // --- Navigation ----------------------------------------------------------------------------

  describe("Back, refresh and history", () => {
    it("goes Step 3 to Step 2 and keeps the answers", async () => {
      const user = await renderJourney();
      await completeStep2(user, "Carry a balance", "Miles");

      await user.click(screen.getByRole("button", { name: "Back" }));

      expect(await screen.findByRole("heading", { name: "Your card behaviour" })).toBeInTheDocument();
      expect(within(balanceGroup()).getByRole("radio", { name: "Carry a balance" })).toBeChecked();
      expect(within(rewardTypeGroup()).getByRole("radio", { name: "Miles" })).toBeChecked();
    });

    it("goes Step 4 to Step 3, keeps the values, and Step 5 back to Step 4", async () => {
      const user = await renderJourney();
      await runToStep4(user);
      await goToStep5(user);

      await user.click(screen.getByRole("button", { name: "Back" }));
      expect(await screen.findByRole("heading", { name: "Your Rewards Check" })).toBeInTheDocument();
      expect(screen.getByText("Net annual value").nextSibling).toHaveTextContent("₹6,800");

      await user.click(screen.getByRole("button", { name: "Back" }));
      expect(await screen.findByRole("heading", { name: "Your priorities and inputs" })).toBeInTheDocument();
      expect(screen.getByLabelText("Monthly card spend")).toHaveValue("25,000");
      expect(screen.getByLabelText("Annual card fee")).toHaveValue("4,000");
      expect(screen.getByLabelText("Cashback received")).toHaveValue("900");
      expect(screen.getByRole("checkbox", { name: "Dining" })).toBeChecked();
      expect(screen.getByLabelText("Period")).toHaveValue("monthly");
    });

    it("follows the visible journey when the browser Back button is used", async () => {
      const user = await renderJourney();
      await runToStep4(user);

      window.history.back();
      expect(await screen.findByRole("heading", { name: "Your priorities and inputs" })).toBeInTheDocument();
      window.history.back();
      expect(await screen.findByRole("heading", { name: "Your card behaviour" })).toBeInTheDocument();
    });

    it("recomputes when inputs change after going back, rather than reusing a stale result", async () => {
      const fetchMock = mockFetchOk();
      const user = await renderJourney();
      await runToStep4(user);
      await user.click(screen.getByRole("button", { name: "Back" }));
      await screen.findByRole("heading", { name: "Your priorities and inputs" });

      await user.clear(screen.getByLabelText("Annual card fee"));
      await user.type(screen.getByLabelText("Annual card fee"), "5000");
      await submitStep3(user);

      expect(fetchMock).toHaveBeenCalledTimes(2);
      expect(requestBody(fetchMock, 1).annual_card_fee).toBe(5000);
    });

    it("preserves framework-owned history state, so the Next.js router does not reload the page on Back", async () => {
      // Next.js App Router keeps its bookkeeping in history.state and reloads the page on a popstate whose
      // state lacks it. Overwriting it wiped the whole journey on Back in a real browser (jsdom cannot see it).
      const routerState = { __NA: true, __PRIVATE_NEXTJS_INTERNALS_TREE: ["", { children: ["money-value", {}] }] };
      window.history.replaceState(routerState, "");
      const user = await renderJourney();
      expect(window.history.state).toMatchObject({ ...routerState, rewardsStep: "card_behaviour" });

      await completeStep2(user);
      expect(window.history.state).toMatchObject({ ...routerState, rewardsStep: "priorities_inputs" });

      await fillBasics(user);
      await fillCashback(user);
      await submitStep3(user);
      expect(window.history.state).toMatchObject({ ...routerState, rewardsStep: "check" });

      await user.click(screen.getByRole("button", { name: "Back" }));
      await screen.findByRole("heading", { name: "Your priorities and inputs" });
      expect(window.history.state).toMatchObject({ ...routerState, rewardsStep: "priorities_inputs" });
      expect(Object.keys(window.history.state).sort()).toEqual(["__NA", "__PRIVATE_NEXTJS_INTERNALS_TREE", "rewardsStep"]);
    });

    it("restarts safely at Step 2 on refresh or an invalid direct entry into a later step", async () => {
      window.history.replaceState({ rewardsStep: "check" }, "");

      await renderJourney();

      expect(screen.getByRole("heading", { name: "Your card behaviour" })).toBeInTheDocument();
      expect(screen.queryByRole("heading", { name: "Your Rewards Check" })).not.toBeInTheDocument();
      expect(window.history.state).toEqual({ rewardsStep: "card_behaviour" });
      screen.getAllByRole("radio").forEach((radio) => expect(radio).not.toBeChecked());
    });

    it("stores only the step identifier in history and no raw input anywhere in the browser", async () => {
      const user = await renderJourney();
      await completeStep2(user, "Carry a balance", "Cashback");
      await fillBasics(user, ["Dining"], "25000", "4000");
      await fillCashback(user, "900");
      await submitStep3(user);
      await goToStep5(user);

      expect(window.history.state).toEqual({ rewardsStep: "example" });
      expect(window.location.search).toBe("");
      expect(window.location.hash).toBe("");
      expect(window.localStorage.length).toBe(0);
      expect(window.sessionStorage.length).toBe(0);
      expect(document.cookie).toBe("");
    });

    it("moves focus to the new screen heading after each step", async () => {
      const user = await renderJourney();
      await completeStep2(user);
      expect(screen.getByRole("heading", { name: "Your priorities and inputs" })).toHaveFocus();

      await fillBasics(user);
      await fillCashback(user);
      await submitStep3(user);
      expect(screen.getByRole("heading", { name: "Your Rewards Check" })).toHaveFocus();
    });
  });

  // --- Analytics -----------------------------------------------------------------------------

  describe("analytics", () => {
    it("emits exactly the approved events, once per screen entry, in order", async () => {
      const user = await renderJourney();
      await runToStep4(user);
      await goToStep5(user);

      expect(emitted()).toEqual([
        ["step_viewed", "rewards_card_behaviour"],
        ["step_completed", "rewards_card_behaviour"],
        ["step_viewed", "rewards_priorities_inputs"],
        ["step_completed", "rewards_priorities_inputs"],
        ["result_declared", "rewards_check"],
        ["connected_example_seen", "rewards_connected_example"],
      ]);
    });

    it("carries only the journey run id and screen name, and no customer values", async () => {
      const user = await renderJourney();
      await runToStep4(user);
      await goToStep5(user);

      const runIds = new Set<unknown>();
      for (const [, journey, details] of trackEventMock.mock.calls) {
        expect(journey).toBe("money_value");
        expect(Object.keys(details).sort()).toEqual(["journeyRunId", "screenName"]);
        runIds.add(details.journeyRunId);
      }
      expect(runIds.size).toBe(1);
      const serialized = JSON.stringify(trackEventMock.mock.calls);
      for (const forbidden of ["25000", "4000", "900", "dining", "travel", "pay_in_full", "cashback", "monthly"]) {
        expect(serialized.toLowerCase()).not.toContain(forbidden);
      }
    });

    it("does not emit on ordinary rerenders such as typing or toggling", async () => {
      const user = await renderJourney();
      await completeStep2(user);
      const before = trackEventMock.mock.calls.length;

      await fillBasics(user);
      await fillCashback(user);
      await user.click(screen.getByRole("checkbox", { name: "Travel" }));
      await user.click(screen.getByRole("checkbox", { name: "Travel" }));

      expect(trackEventMock.mock.calls.length).toBe(before);
    });

    it("emits again only when a screen is genuinely re-entered", async () => {
      const user = await renderJourney();
      await completeStep2(user);
      await user.click(screen.getByRole("button", { name: "Back" }));
      await screen.findByRole("heading", { name: "Your card behaviour" });

      const views = emitted().filter(([type, screen_]) => type === "step_viewed" && screen_ === "rewards_card_behaviour");
      expect(views).toHaveLength(2);
    });

    it("never emits legacy continuation, pilot, OTP or consent events", async () => {
      const user = await renderJourney();
      await runToStep4(user);
      await goToStep5(user);

      const types = trackEventMock.mock.calls.map(([type]) => type);
      for (const legacy of [
        "journey_started",
        "result_requested",
        "result_viewed",
        "check_started",
        "reward_type_selected",
        "reward_help_opened",
        "teaser_viewed",
        "next_interest_selected",
        "go_deeper_selected",
        "pilot_cta_selected",
        "mobile_entry_started",
        "otp_requested",
        "pilot_consent_recorded",
        "marketing_consent_recorded",
        "consent_withdrawn",
      ]) {
        expect(types).not.toContain(legacy);
      }
    });

    it("fails open: a tracking error never blocks the journey", async () => {
      trackEventMock.mockImplementation(() => {
        throw new Error("tracking unavailable");
      });
      const user = await renderJourney();
      await runToStep4(user);
      await goToStep5(user);

      expect(screen.getByRole("note")).toHaveTextContent("ILLUSTRATIVE EXAMPLE — NOT YOUR DATA");
    });
  });
});

// --- Visual reconciliation: brand frame, example mode, wording and the incomplete state ------------

const EXAMPLE_BANNER = "Example mode — these are sample figures, not your data.";

async function useExample(user: User) {
  await user.click(screen.getByRole("tab", { name: "Try an example" }));
  await user.click(screen.getByRole("button", { name: "Use these example values" }));
}

describe("Rewards journey: reconciled frame, example mode and honest incomplete state", () => {
  beforeEach(() => {
    ensureAnonymousSessionMock.mockReset();
    ensureAnonymousSessionMock.mockResolvedValue(undefined);
    trackEventMock.mockReset();
    window.sessionStorage.clear();
    window.localStorage.clear();
    window.history.replaceState(null, "");
    mockFetchOk();
  });

  afterEach(() => cleanup());

  it("shows the Sutriva logo and step progress on every step", async () => {
    const user = await renderJourney();
    const header = () => document.querySelector("header") as HTMLElement;
    expect(within(header()).getByText("Sutriva")).toBeInTheDocument();
    expect(header().querySelector("svg")).not.toBeNull();
    expect(header()).toHaveTextContent("Step 2 of 5");
    await completeStep2(user);
    expect(header()).toHaveTextContent("Step 3 of 5");
    await fillBasics(user);
    await fillCashback(user);
    await submitStep3(user);
    expect(header()).toHaveTextContent("Step 4 of 5");
    await goToStep5(user);
    expect(header()).toHaveTextContent("Step 5 of 5");
  });

  it("asks which reward type to assess, with helper text, as a single choice", async () => {
    await renderJourney();
    expect(screen.queryByRole("group", { name: "What type of rewards does your card offer?" })).toBeNull();
    const group = rewardTypeGroup();
    expect(group).toHaveAccessibleDescription(REWARD_TYPE_HELPER);
    const radios = within(group).getAllByRole("radio");
    expect(radios.map((radio) => (radio as HTMLInputElement).type)).toEqual(["radio", "radio", "radio", "radio"]);
    expect(within(group).queryAllByRole("checkbox")).toHaveLength(0);
  });

  it("keeps the reward type single-select: choosing another replaces the first", async () => {
    const user = await renderJourney();
    await user.click(within(rewardTypeGroup()).getByRole("radio", { name: "Points" }));
    await user.click(within(rewardTypeGroup()).getByRole("radio", { name: "Miles" }));
    expect(within(rewardTypeGroup()).getByRole("radio", { name: "Points" })).not.toBeChecked();
    expect(within(rewardTypeGroup()).getByRole("radio", { name: "Miles" })).toBeChecked();
  });

  it("previews the sample without touching the form, then fills Steps 2 and 3 from it", async () => {
    const user = await renderJourney();
    expect(screen.getByRole("tab", { name: "Enter my values" })).toHaveAttribute("aria-selected", "true");
    await user.click(screen.getByRole("tab", { name: "Try an example" }));
    expect(screen.getByRole("tabpanel")).toHaveTextContent("₹25,000");
    screen.getAllByRole("radio").forEach((radio) => expect(radio).not.toBeChecked());
    expect(screen.queryByText(EXAMPLE_BANNER)).toBeNull();

    await user.click(screen.getByRole("button", { name: "Use these example values" }));
    expect(screen.getByRole("status")).toHaveTextContent(EXAMPLE_BANNER);
    expect(within(balanceGroup()).getByRole("radio", { name: "Pay in full each month" })).toBeChecked();
    expect(within(rewardTypeGroup()).getByRole("radio", { name: "Cashback" })).toBeChecked();

    await user.click(screen.getByRole("button", { name: "Continue" }));
    await screen.findByRole("heading", { name: "Your priorities and inputs" });
    expect(screen.getByRole("status")).toHaveTextContent(EXAMPLE_BANNER);
    for (const name of ["Dining", "Travel", "Grocery"]) expect(screen.getByRole("checkbox", { name })).toBeChecked();
    expect(screen.getByRole("checkbox", { name: "Everyday bills" })).not.toBeChecked();
    expect(screen.getByLabelText("Monthly card spend")).toHaveValue("25,000");
    expect(screen.getByLabelText("Annual card fee")).toHaveValue("4,000");
    expect(screen.getByLabelText("Cashback received")).toHaveValue("900");
    expect(screen.getByLabelText("Period")).toHaveValue("monthly");
    expect(screen.queryByText("Example values edited")).toBeNull();

    await user.type(screen.getByLabelText("Annual card fee"), "5");
    expect(screen.getByText("Example values edited")).toBeInTheDocument();
  });

  it("clears the example, returns to Step 2 and leaves every field empty", async () => {
    const user = await renderJourney();
    await useExample(user);
    await user.click(screen.getByRole("button", { name: "Continue" }));
    await screen.findByRole("heading", { name: "Your priorities and inputs" });

    await user.click(screen.getByRole("button", { name: "Clear example and enter my values" }));
    await screen.findByRole("heading", { name: "Your card behaviour" });
    expect(screen.queryByText(EXAMPLE_BANNER)).toBeNull();
    expect(screen.getByRole("tab", { name: "Enter my values" })).toHaveAttribute("aria-selected", "true");
    screen.getAllByRole("radio").forEach((radio) => expect(radio).not.toBeChecked());

    await user.click(within(balanceGroup()).getByRole("radio", { name: "Not sure" }));
    await user.click(within(rewardTypeGroup()).getByRole("radio", { name: "Cashback" }));
    await user.click(screen.getByRole("button", { name: "Continue" }));
    await screen.findByRole("heading", { name: "Your priorities and inputs" });
    expect(screen.getByLabelText("Monthly card spend")).toHaveValue("");
    screen.getAllByRole("checkbox").forEach((box) => expect(box).not.toBeChecked());
  });

  it("sends the sample as the request and carries the same dataset through Steps 4 and 5", async () => {
    const fetchMock = mockFetchOk();
    const user = await renderJourney();
    await useExample(user);
    await user.click(screen.getByRole("button", { name: "Continue" }));
    await screen.findByRole("heading", { name: "Your priorities and inputs" });
    await user.click(screen.getByRole("button", { name: "Check my rewards" }));
    await screen.findByRole("heading", { name: "Your Rewards Check" });

    expect(requestBody(fetchMock)).toEqual({
      monthly_card_spend: 25000,
      annual_card_fee: 4000,
      reward_type: "cashback",
      spending_priorities: ["dining", "travel", "grocery"],
      balance_behavior: "pay_in_full",
      reward_period: "monthly",
      reward_input_basis: "cashback_amount",
      cashback_amount: 900,
    });
    expect(screen.getByRole("status")).toHaveTextContent(EXAMPLE_BANNER);
    expect(screen.getByText("Net annual value").nextSibling).toHaveTextContent("₹6,800");

    await user.click(screen.getByRole("button", { name: /See a connected-data example/ }));
    await screen.findByRole("heading", { name: "Your figures at a glance" });
    expect(screen.getByRole("status")).toHaveTextContent(EXAMPLE_BANNER);
    const glance = screen.getByRole("region", { name: /Rewards, fee and net value/ });
    expect(glance).toHaveTextContent("₹10,800");
    expect(glance).toHaveTextContent("₹4,000");
    expect(glance).toHaveTextContent("₹6,800");
    expect(glance).toHaveTextContent("Dining, Travel, Grocery");
  });

  it("keeps the illustrative panel free of the customer's figures", async () => {
    const user = await renderJourney();
    await runToStep4(user);
    await goToStep5(user);
    const illustrative = screen.getByRole("region", { name: "What connected data could add" });
    expect(illustrative).toContainElement(screen.getByRole("note"));
    for (const value of ["10,800", "6,800", "4,000", "900"]) expect(illustrative.textContent ?? "").not.toContain(value);
    const glance = screen.getByRole("region", { name: /Rewards, fee and net value/ });
    expect(glance).toHaveTextContent("₹6,800");
    expect(illustrative).not.toContainElement(glance);
  });

  it("says Can't calculate yet, and gives the reason, when the reward value is unknown", async () => {
    mockFetchOk({ reward_value_known: false, estimated_annual_rewards: null, estimated_net_annual_value: null, reward_amount_per_period: null, reward_period: null, main_pressure_code: "REWARD_VALUE_UNKNOWN" });
    const user = await renderJourney();
    await completeStep2(user, "Pay in full each month", "Not sure");
    await fillBasics(user);
    await submitStep3(user);

    expect(screen.getByText("Net annual value").nextSibling).toHaveTextContent("Can't calculate yet");
    expect(screen.getByText("We need your monthly reward value to show anything here.")).toBeInTheDocument();
    expect(screen.getByText("We need a reward value to work out what your rewards are worth. We haven’t guessed one.")).toBeInTheDocument();
    const bars = screen.getByRole("region", { name: /Rewards vs fee/ });
    expect(bars).toHaveTextContent("Unknown");
    expect(bars).not.toHaveTextContent("₹0");

    await user.click(screen.getByRole("button", { name: /See a connected-data example/ }));
    await screen.findByRole("heading", { name: "Your figures at a glance" });
    const glance = screen.getByRole("region", { name: /Rewards, fee and net value/ });
    expect(glance).toHaveTextContent("Unknown");
    expect(glance).toHaveTextContent("Can't calculate yet");
    expect(glance).not.toHaveTextContent("₹0");
  });

  it("shows the known before-interest value for a carried balance instead of a dead end", async () => {
    mockFetchOk({ interest_input_basis: "unknown", interest_value_known: false, estimated_annual_interest_cost: null, estimated_net_annual_value: null, main_pressure_code: "INTEREST_EFFECT_UNKNOWN" });
    const user = await renderJourney();
    await runToStep4(user, "Carry a balance");
    expect(screen.getByText("Net annual value").nextSibling).toHaveTextContent("₹6,800");
    expect(screen.getByText("Estimate from your entries; excludes interest.")).toBeInTheDocument();
    expect(screen.getByText("Interest impact is unknown. No interest cost has been assumed.")).toBeInTheDocument();
    expect(screen.queryByText(/Estimated annual interest/)).toBeNull();
  });

  it("offers Change my figures on the result, returning to Step 3 with the entries kept", async () => {
    const user = await renderJourney();
    await runToStep4(user);
    await user.click(screen.getByRole("button", { name: "Change my figures" }));
    expect(await screen.findByRole("heading", { name: "Your priorities and inputs" })).toBeInTheDocument();
    expect(screen.getByLabelText("Monthly card spend")).toHaveValue("25,000");
  });

  it("groups rupee entries in the Indian style", async () => {
    const user = await renderJourney();
    await completeStep2(user);
    const spend = screen.getByLabelText("Monthly card spend");
    await user.type(spend, "1234567");
    expect(spend).toHaveValue("12,34,567");
  });

  it("keeps a typed negative amount negative and invalid, and blocks submission", async () => {
    const user = await renderJourney();
    await completeStep2(user);
    await user.click(screen.getByRole("checkbox", { name: "Dining" }));
    const spend = screen.getByLabelText("Monthly card spend");
    await user.type(spend, "-25000");
    expect(spend).toHaveValue("-25,000");
    await user.type(screen.getByLabelText("Annual card fee"), "4000");
    await fillCashback(user);

    await user.click(screen.getByRole("button", { name: "Check my rewards" }));
    expect(await screen.findByRole("alert")).toHaveTextContent("Enter your monthly card spend. Enter 0 if it was zero.");
    expect(screen.getByLabelText("Monthly card spend")).toHaveValue("-25,000");
  });

  it("keeps a pasted negative amount negative, not a positive value", async () => {
    const user = await renderJourney();
    await completeStep2(user);
    const fee = screen.getByLabelText("Annual card fee");
    await user.click(fee);
    await user.paste("-4000");
    expect(fee).toHaveValue("-4,000");

    await user.click(fee);
    await user.keyboard("{Control>}a{/Control}");
    await user.paste("−4000");
    expect(fee).toHaveValue("-4,000");
  });

  it("never mentions a later phase on any step, and emits only the approved events without values", async () => {
    const user = await renderJourney();
    const forbidden = /pilot|mobile number|OTP|Twilio|consent|connect (my|your)? ?(bank|account|bureau)|upload (a )?statement|Step 6/i;
    expect(document.body.textContent ?? "").not.toMatch(forbidden);
    await useExample(user);
    await user.click(screen.getByRole("button", { name: "Continue" }));
    await screen.findByRole("heading", { name: "Your priorities and inputs" });
    expect(document.body.textContent ?? "").not.toMatch(forbidden);
    await user.click(screen.getByRole("button", { name: "Check my rewards" }));
    await screen.findByRole("heading", { name: "Your Rewards Check" });
    expect(document.body.textContent ?? "").not.toMatch(forbidden);
    await goToStep5(user);
    expect(document.body.textContent ?? "").not.toMatch(forbidden);

    expect(emitted()).toEqual([
      ["step_viewed", "rewards_card_behaviour"],
      ["step_completed", "rewards_card_behaviour"],
      ["step_viewed", "rewards_priorities_inputs"],
      ["step_completed", "rewards_priorities_inputs"],
      ["result_declared", "rewards_check"],
      ["connected_example_seen", "rewards_connected_example"],
    ]);
    expect(JSON.stringify(trackEventMock.mock.calls)).not.toMatch(/25000|4000|900|cashback|Example mode/i);
  });
});
