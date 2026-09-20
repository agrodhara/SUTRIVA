"use client";

import { ChangeEvent, FormEvent, useEffect, useMemo, useState } from "react";
import { ensureAnonymousSession, requireApiBaseUrl, trackEvent } from "../../lib/api";
import { currency, ErrorState, ExampleValuesButton, FinancialInput, InsightBlock, LoadingState, moneyValueStatusLabels, reasonCodeLabels, ResultMetric } from "../../components/QuickCheckUI";
import { MoneyValueContinuationFlow, Track11ContinuationStep, Track11ResultVariant } from "../../components/Track11Flow";
import { createJourneyRunId, getMoneyCardCheckNumber, incrementMoneyCardCheckNumber, shouldEmitEventOnce, track11aEnabled, track11bEnabled } from "../../lib/journeySession";
import { useHydrated } from "../../lib/useHydrated";

type RewardType = "cashback" | "points" | "miles" | "not_sure";
type RewardInputBasis = "rate_percent" | "cashback_amount" | "earned_units" | "known_reward_value";
type InterestInputBasis = "no_balance" | "known" | "unknown";
type PointsMilesKnowledge = "" | "yes" | "unknown";
type CashbackKnowledge = "known" | "unknown";

type Result = {
  estimated_annual_rewards: number | null;
  annual_card_fee: number;
  estimated_annual_interest_cost: number | null;
  estimated_net_annual_value: number | null;
  reward_value_known: boolean;
  interest_value_known: boolean;
  reward_input_basis?: RewardInputBasis | null;
  reward_period?: "monthly" | "quarterly" | "yearly" | null;
  annualized_reward_units?: number | null;
  interest_input_basis: InterestInputBasis;
  unknown_value_reason?: string | null;
  value_status: string;
  reason_codes: string[];
  next_best_action: string;
};

type ViewMode = "result" | "continuation";

type FormState = {
  monthly_card_spend: string;
  annual_card_fee: string;
  estimated_reward_rate_percent: string;
  reward_type: RewardType;
  reward_input_basis: RewardInputBasis;
  reward_period: "monthly" | "quarterly" | "yearly";
  reward_units_earned: string;
  reward_value_amount: string;
  points_miles_knowledge: PointsMilesKnowledge;
  cashback_knowledge: CashbackKnowledge;
  cashback_amount: string;
  reward_value_unknown: boolean;
  interest_input_basis: InterestInputBasis;
  revolving_balance: string;
  annual_interest_rate_percent: string;
};

type FormTextKey = Exclude<keyof FormState, "reward_value_unknown">;

const SPEND_SLIDER_MIN = 0;
const SPEND_SLIDER_MAX = 200000;
const SPEND_SLIDER_STEP = 500;
const SPEND_SLIDER_EXPAND_BY = 25000;

const FEE_SLIDER_MIN = 0;
const FEE_SLIDER_MAX = 50000;
const FEE_SLIDER_STEP = 100;
const FEE_SLIDER_EXPAND_BY = 5000;

const WHAT_IF_UPDATE_ERROR_MESSAGE = "We couldn’t update your estimate. Your previous result is still shown. Please try again.";

const INDIAN_NUMBER = new Intl.NumberFormat("en-IN");

function guidanceParagraphs(text: string): string[] {
  return text
    .split("|")
    .map((part) => part.trim())
    .filter(Boolean);
}

function parseNonNegativeWholeAmount(value: string): string {
  const digitsOnly = value.replace(/[^\d]/g, "");
  if (!digitsOnly) return "";
  return String(Number(digitsOnly));
}

function formatAmountInput(raw: string): string {
  if (!raw) return "";
  const numeric = Number(raw);
  if (!Number.isFinite(numeric)) return "";
  return `₹ ${INDIAN_NUMBER.format(numeric)}`;
}

function nextExpandedMax(currentMax: number, value: number, expandBy: number): number {
  if (value <= currentMax) return currentMax;
  return Math.ceil(value / expandBy) * expandBy;
}

function sliderValueForDisplay(raw: string, min: number, max: number, step: number): string {
  const numeric = Number(raw);
  if (!Number.isFinite(numeric)) return String(min);
  const clamped = Math.max(min, Math.min(max, numeric));
  const steps = Math.round((clamped - min) / step);
  return String(min + steps * step);
}

export default function LegacyMoneyValuePage() {
  const [form, setForm] = useState<FormState>({
    monthly_card_spend: "",
    annual_card_fee: "",
    estimated_reward_rate_percent: "",
    reward_type: "cashback" as RewardType,
    reward_input_basis: "cashback_amount" as RewardInputBasis,
    reward_period: "monthly",
    reward_value_amount: "",
    reward_units_earned: "",
    points_miles_knowledge: "",
    cashback_knowledge: "known",
    cashback_amount: "",
    reward_value_unknown: false,
    interest_input_basis: "no_balance",
    revolving_balance: "",
    annual_interest_rate_percent: "",
  });
  const [result, setResult] = useState<Result>();

  useEffect(() => {
    void (ensureAnonymousSession().catch(() => undefined));
  }, []);
  const [journeyRunId, setJourneyRunId] = useState(() => createJourneyRunId());
  const [cardCheckNumber, setCardCheckNumber] = useState(() => getMoneyCardCheckNumber());
  const [resultVariant, setResultVariant] = useState<Track11ResultVariant>("original");
  const [trackStep, setTrackStep] = useState<Track11ContinuationStep>("reveal");
  const [trackEntryId, setTrackEntryId] = useState(0);
  const [viewMode, setViewMode] = useState<ViewMode>("result");
  const [rewardHelpOpen, setRewardHelpOpen] = useState(false);
  const [isStale, setIsStale] = useState(false);
  const [exampleMode, setExampleMode] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [whatIfError, setWhatIfError] = useState("");
  const hydrated = useHydrated();
  const interactionDisabled = !hydrated || loading;
  const isTrack11A = track11aEnabled();
  const isTrack11B = track11bEnabled();
  const isContinuationEnabled = isTrack11A && isTrack11B;

  useEffect(() => {
    if (!isTrack11A) return;
    const startKey = `journey_started:money_value:${journeyRunId}`;
    if (!shouldEmitEventOnce(startKey)) return;
    trackEvent("journey_started", "money_value", { journeyRunId, cardCheckNumber });
  }, [journeyRunId, cardCheckNumber, isTrack11A]);

  useEffect(() => {
    if (!isTrack11A) return;
    const currentStep = result ? (viewMode === "continuation" ? `continuation_${trackStep}` : "result") : "input_form";
    const stepKey = `step_viewed:money_value:${journeyRunId}:${currentStep}:${trackEntryId}`;
    if (!shouldEmitEventOnce(stepKey)) return;
    trackEvent("step_viewed", "money_value", { journeyRunId, cardCheckNumber });
  }, [journeyRunId, cardCheckNumber, result, viewMode, trackStep, trackEntryId, isTrack11A]);

  const [spendSliderMax, setSpendSliderMax] = useState(SPEND_SLIDER_MAX);
  const [feeSliderMax, setFeeSliderMax] = useState(FEE_SLIDER_MAX);

  const set = (key: FormTextKey) => (event: ChangeEvent<HTMLInputElement>) => {
    setExampleMode(false);
    setIsStale(true);
    setWhatIfError("");
    setForm((previous) => ({ ...previous, [key]: event.target.value }));
  };

  const setSelect = (key: FormTextKey) => (event: ChangeEvent<HTMLSelectElement>) => {
    setExampleMode(false);
    setIsStale(true);
    setWhatIfError("");
    setForm((previous) => ({ ...previous, [key]: event.target.value }));
  };

  const setCashbackPercentageMode = (useRatePercent: boolean) => {
    setExampleMode(false);
    setIsStale(true);
    setWhatIfError("");
    setForm((previous) => ({
      ...previous,
      reward_input_basis: useRatePercent ? "rate_percent" : "cashback_amount",
      reward_value_unknown: previous.cashback_knowledge === "unknown",
    }));
  };

  const setCashbackKnowledge = (knowledge: CashbackKnowledge) => {
    setExampleMode(false);
    setIsStale(true);
    setWhatIfError("");
    setForm((previous) => ({
      ...previous,
      cashback_knowledge: knowledge,
      reward_value_unknown: knowledge === "unknown",
      estimated_reward_rate_percent: knowledge === "unknown" ? "" : previous.estimated_reward_rate_percent,
      cashback_amount: knowledge === "unknown" ? "" : previous.cashback_amount,
    }));
  };

  const setPointsMilesKnowledge = (knowledge: PointsMilesKnowledge) => {
    setExampleMode(false);
    setIsStale(true);
    setWhatIfError("");
    setForm((previous) => ({
      ...previous,
      points_miles_knowledge: knowledge,
      reward_input_basis: knowledge === "yes" ? "known_reward_value" : previous.reward_input_basis,
      reward_value_unknown: knowledge === "unknown",
      reward_value_amount: knowledge === "yes" ? previous.reward_value_amount : "",
      reward_units_earned: knowledge === "unknown" ? previous.reward_units_earned : previous.reward_units_earned,
    }));
  };

  const setInterestBasis = (basis: InterestInputBasis) => {
    setExampleMode(false);
    setIsStale(true);
    setWhatIfError("");
    setForm((previous) => ({
      ...previous,
      interest_input_basis: basis,
      revolving_balance: basis === "known" ? previous.revolving_balance : "",
      annual_interest_rate_percent: basis === "known" ? previous.annual_interest_rate_percent : "",
    }));
  };

  const setRewardType = (rewardType: RewardType) => {
    setExampleMode(false);
    setIsStale(true);
    setWhatIfError("");
    setForm((previous) => ({
      ...previous,
      reward_type: rewardType,
      reward_input_basis: rewardType === "cashback" ? "cashback_amount" : rewardType === "not_sure" ? previous.reward_input_basis : "known_reward_value",
      estimated_reward_rate_percent: rewardType === "cashback" ? previous.estimated_reward_rate_percent : "",
      cashback_amount: rewardType === "cashback" ? previous.cashback_amount : "",
      reward_value_amount:
        (previous.reward_type === "points" && rewardType === "miles") || (previous.reward_type === "miles" && rewardType === "points")
          ? ""
          : rewardType === "points" || rewardType === "miles"
            ? previous.reward_value_amount
            : "",
      reward_units_earned: rewardType === "points" || rewardType === "miles" ? previous.reward_units_earned : "",
      points_miles_knowledge:
        (previous.reward_type === "points" && rewardType === "miles") || (previous.reward_type === "miles" && rewardType === "points")
          ? ""
          : rewardType === "points" || rewardType === "miles"
            ? previous.points_miles_knowledge
            : "",
      cashback_knowledge: rewardType === "cashback" ? previous.cashback_knowledge : "known",
      reward_value_unknown:
        rewardType === "not_sure"
          ? true
          : rewardType === "cashback"
            ? previous.cashback_knowledge === "unknown"
            : rewardType === "points" || rewardType === "miles"
              ? previous.points_miles_knowledge === "unknown"
              : false,
    }));
  };

  const setSliderAmount = (key: "monthly_card_spend" | "annual_card_fee", max: number) => (event: ChangeEvent<HTMLInputElement>) => {
    setExampleMode(false);
    setIsStale(true);
    setWhatIfError("");
    const nextValue = String(Number(event.target.value));
    setForm((previous) => ({ ...previous, [key]: nextValue }));

    if (key === "monthly_card_spend") {
      setSpendSliderMax(nextExpandedMax(max, Number(nextValue), SPEND_SLIDER_EXPAND_BY));
    }
    if (key === "annual_card_fee") {
      setFeeSliderMax(nextExpandedMax(max, Number(nextValue), FEE_SLIDER_EXPAND_BY));
    }
  };

  const setTypedAmount = (key: "monthly_card_spend" | "annual_card_fee") => (event: ChangeEvent<HTMLInputElement>) => {
    setExampleMode(false);
    setIsStale(true);
    setWhatIfError("");
    const normalized = parseNonNegativeWholeAmount(event.target.value);
    setForm((previous) => ({ ...previous, [key]: normalized }));

    if (!normalized) return;

    const numeric = Number(normalized);
    if (key === "monthly_card_spend") {
      setSpendSliderMax((current) => nextExpandedMax(current, numeric, SPEND_SLIDER_EXPAND_BY));
    }
    if (key === "annual_card_fee") {
      setFeeSliderMax((current) => nextExpandedMax(current, numeric, FEE_SLIDER_EXPAND_BY));
    }
  };

  const buildPayload = () => {
    const payload: Record<string, unknown> = {
      monthly_card_spend: Number(form.monthly_card_spend),
      annual_card_fee: Number(form.annual_card_fee),
      reward_type: form.reward_type,
    };

    if (form.interest_input_basis === "no_balance") {
      payload.interest_input_basis = "no_balance";
      payload.revolving_balance = 0;
      payload.annual_interest_rate_percent = 0;
    } else if (form.interest_input_basis === "unknown") {
      payload.interest_input_basis = "unknown";
      payload.interest_value_unknown = true;
    } else {
      payload.interest_input_basis = "known";
      payload.revolving_balance = Number(form.revolving_balance);
      payload.annual_interest_rate_percent = Number(form.annual_interest_rate_percent);
    }

    if (form.reward_type === "not_sure") {
      payload.reward_value_unknown = true;
      return payload;
    }

    if (form.reward_type === "cashback" && form.cashback_knowledge === "unknown") {
      payload.reward_value_unknown = true;
      return payload;
    }

    if ((form.reward_type === "points" || form.reward_type === "miles") && form.points_miles_knowledge === "unknown") {
      payload.reward_value_unknown = true;
      return payload;
    }

    payload.reward_input_basis = form.reward_input_basis;

    if (form.reward_input_basis === "rate_percent") {
      payload.estimated_reward_rate_percent = Number(form.estimated_reward_rate_percent);
    }

    if (form.reward_input_basis === "cashback_amount") {
      payload.cashback_amount = Number(form.cashback_amount);
      payload.reward_period = form.reward_period;
    }

    if (form.reward_input_basis === "known_reward_value") {
      payload.reward_value_amount = Number(form.reward_value_amount);
      payload.reward_period = form.reward_period;
      payload.reward_amount_is_estimate = true;
    }

    if (form.reward_input_basis === "earned_units") {
      payload.reward_units_earned = Number(form.reward_units_earned);
      payload.reward_period = form.reward_period;
    }

    return payload;
  };

  const canOpenContinuation = !!result && !isStale && !error && !whatIfError;

  async function submit(event: FormEvent) {
    event.preventDefault();
    setLoading(true); setError(""); setWhatIfError("");
    trackEvent("check_started", "money_value", { journeyRunId, cardCheckNumber });
    if (isTrack11A) {
      trackEvent("step_completed", "money_value", { journeyRunId, cardCheckNumber });
      trackEvent("result_requested", "money_value", { journeyRunId, cardCheckNumber });
    }
    try {
      const response = await fetch(`${requireApiBaseUrl()}/v1/financial-intelligence/money-value-check`, {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify(buildPayload()),
      });
      if (!response.ok) throw new Error("We couldn’t complete your money value check. Please check your inputs.");
      setResult(await response.json());
      setResultVariant("original");
      setTrackStep("reveal");
      setViewMode("result");
      setIsStale(false);
      if (isTrack11A) {
        trackEvent("result_viewed", "money_value", { journeyRunId, cardCheckNumber });
        trackEvent("reward_result_state_viewed", "money_value", { journeyRunId, cardCheckNumber });
      }
      trackEvent("check_completed", "money_value", { journeyRunId, cardCheckNumber });
    } catch (err) {
      if (isTrack11A) {
        trackEvent("result_failed", "money_value", { journeyRunId, cardCheckNumber });
      }
      setError(err instanceof Error ? err.message : "Something went wrong.");
    } finally { setLoading(false); }
  }

  async function runWhatIfRequest() {
    setLoading(true);
    trackEvent("what_if_started", "money_value", { journeyRunId, cardCheckNumber });
    if (isTrack11A) {
      trackEvent("result_requested", "money_value", { journeyRunId, cardCheckNumber });
    }
    try {
      const response = await fetch(`${requireApiBaseUrl()}/v1/financial-intelligence/money-value-check`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(buildPayload()) });
      if (!response.ok) throw new Error(WHAT_IF_UPDATE_ERROR_MESSAGE);
      setResult(await response.json());
      setResultVariant("what_if");
      setTrackStep("reveal");
      setTrackEntryId((previous) => previous + 1);
      setViewMode("result");
      setIsStale(false);
      setWhatIfError("");
      if (isTrack11A) {
        trackEvent("result_viewed", "money_value", { journeyRunId, cardCheckNumber });
        trackEvent("reward_result_state_viewed", "money_value", { journeyRunId, cardCheckNumber });
      }
      trackEvent("what_if_completed", "money_value", { journeyRunId, cardCheckNumber });
    } catch (err) {
      if (isTrack11A) {
        trackEvent("result_failed", "money_value", { journeyRunId, cardCheckNumber });
      }
      console.error("money-value what-if update failed", err);
      setWhatIfError(WHAT_IF_UPDATE_ERROR_MESSAGE);
    } finally {
      setLoading(false);
    }
  }

  async function runWhatIf(event: FormEvent) {
    event.preventDefault();
    await runWhatIfRequest();
  }

  function openRewardHelp() {
    setRewardHelpOpen(true);
    if (isTrack11A) {
      trackEvent("reward_help_opened", "money_value", { journeyRunId, cardCheckNumber });
    }
  }

  function selectRewardHelpOutcome(outcome: "cashback" | "points_or_miles" | "unknown") {
    if (isTrack11A) {
      trackEvent("reward_help_outcome_selected", "money_value", { journeyRunId, cardCheckNumber });
    }
    if (outcome === "cashback") {
      setRewardType("cashback");
      return;
    }
    if (outcome === "points_or_miles") {
      setRewardType("points");
      setPointsMilesKnowledge("unknown");
      return;
    }
    setRewardType("not_sure");
  }

  function startAnotherCardCheck() {
    trackEvent("check_another_selected", "money_value", { journeyRunId, cardCheckNumber });
    trackEvent("journey_completed", "money_value", { journeyRunId, cardCheckNumber });
    const nextCardCheckNumber = incrementMoneyCardCheckNumber();
    setCardCheckNumber(nextCardCheckNumber);
    setJourneyRunId(createJourneyRunId());
    setViewMode("result");
    setResult(undefined);
    setResultVariant("original");
    setTrackStep("reveal");
    setTrackEntryId(0);
    setIsStale(false);
    setWhatIfError("");
    setRewardHelpOpen(false);
    setError("");
  }

  const displayResult = useMemo(() => result, [result]);

  useEffect(() => {
    if (!isTrack11A || !displayResult || !exampleMode || viewMode !== "result") return;
    const viewedKey = `illustrative_example_viewed:money_value:${journeyRunId}`;
    if (!shouldEmitEventOnce(viewedKey)) return;
    trackEvent("illustrative_example_viewed", "money_value", { journeyRunId, cardCheckNumber });
  }, [displayResult, exampleMode, viewMode, journeyRunId, cardCheckNumber, isTrack11A]);

  const formatCurrencyMaybe = (value: number | null, reason?: string | null) => {
    if (value !== null) return currency(value);
    if (reason === "REWARD_VALUE_UNKNOWN") return "Unknown until reward value is provided";
    if (reason === "INTEREST_VALUE_UNKNOWN") return "Unknown until carried balance details are provided";
    if (reason === "REWARD_VALUE_INPUT_INCOMPLETE") return "Unknown until reward value and period are provided";
    if (reason === "REWARD_CONVERSION_UNKNOWN") return "Unknown until rupee value per point/mile is provided";
    return "Unknown until reward details are completed";
  };

  const rewardUnknown = !!displayResult && !displayResult.reward_value_known;
  const interestUnknown = !!displayResult && !displayResult.interest_value_known;
  const isRateBased = form.reward_type === "cashback" && form.reward_input_basis === "rate_percent" && form.cashback_knowledge === "known";
  const isUnknownRewardInput =
    form.reward_type === "not_sure" ||
    (form.reward_type === "cashback" && form.cashback_knowledge === "unknown") ||
    ((form.reward_type === "points" || form.reward_type === "miles") && form.points_miles_knowledge === "unknown");

  if (displayResult && viewMode === "continuation" && isContinuationEnabled) {
    return <main className="shell journey"><a className="backLink" href="#" onClick={(event) => { event.preventDefault(); setViewMode("result"); }}>← Back to estimate details</a>
      <MoneyValueContinuationFlow
        journey="money_value"
        journeyRunId={journeyRunId}
        step={trackStep}
        logicalEntryId={trackEntryId}
        resultVariant={resultVariant}
        returnLabel="← Back to estimate details"
        onNavigate={setTrackStep}
        onReturnToResult={() => setViewMode("result")}
        netAnnualValue={formatCurrencyMaybe(displayResult.estimated_net_annual_value, displayResult.unknown_value_reason)}
      />
    </main>;
  }

  if (displayResult) return <main className="shell journey"><a className="backLink" href="/money-value">← Update details</a><p className="eyebrow">Get More From My Money</p><h1>Your money value check</h1><div className="buttonRow"><button type="button" className="secondaryButton" onClick={startAnotherCardCheck}>Check another card</button></div><p className="estimateLabel">{exampleMode ? "Example preview" : "Your estimate"}</p>
    <InsightBlock title={rewardUnknown ? "Your reward value is still missing" : "1. What did we find?"}>
      {rewardUnknown && <p className="status">We can show the card costs you entered, but we can&apos;t yet tell whether your rewards cover them.</p>}
      <div className="metrics">
        {!rewardUnknown && <ResultMetric label="Estimated annual rewards" value={formatCurrencyMaybe(displayResult.estimated_annual_rewards)} />}
        <ResultMetric label="Annual fee" value={currency(displayResult.annual_card_fee)} />
        <ResultMetric label="Estimated annual interest cost" value={formatCurrencyMaybe(displayResult.estimated_annual_interest_cost, displayResult.unknown_value_reason)} />
        {!rewardUnknown && !interestUnknown && <ResultMetric label="Estimated net annual value" value={formatCurrencyMaybe(displayResult.estimated_net_annual_value, displayResult.unknown_value_reason)} />}
      </div>
      {!rewardUnknown && <p className="status">{moneyValueStatusLabels[displayResult.value_status] ?? "Your money value result is ready"}</p>}
      {!rewardUnknown && displayResult.reward_period === "monthly" && <p className="status">Annual estimate assumes the monthly reward amount stays the same for 12 months. Actual rewards may vary.</p>}
      {!rewardUnknown && isTrack11A && displayResult.reward_period === "quarterly" && <p className="status">Annual estimate assumes the quarterly reward amount stays the same for 4 quarters. Actual rewards may vary.</p>}
      {!rewardUnknown && (displayResult.reward_input_basis === "cashback_amount" || displayResult.reward_input_basis === "known_reward_value") && displayResult.reward_period === "yearly" && <p className="status">Based on the yearly reward value you entered.</p>}
      {!rewardUnknown && displayResult.reward_input_basis === "rate_percent" && <p className="status">This estimate assumes the entered cashback percentage applies to the entered spend.</p>}
      {isTrack11A && rewardUnknown && displayResult.annualized_reward_units !== null && displayResult.annualized_reward_units !== undefined && <p className="status">Annualized rewards quantity: {displayResult.annualized_reward_units}</p>}
      {interestUnknown && <p className="status">Interest cost is missing, so net annual value cannot be finalized yet. Current formula: carried balance × annual interest rate % ÷ 100.</p>}
    </InsightBlock>
    <InsightBlock title="2. Why does it matter?"><div className="reasonParagraphs">{displayResult.reason_codes.map((code, index) => <p key={`${code}-${index}`}>{reasonCodeLabels[code] ?? "One or more costs may be affecting the value you receive."}</p>)}</div></InsightBlock>
    <InsightBlock title="3. What should I do next?"><div className="reasonParagraphs">{guidanceParagraphs(displayResult.next_best_action).map((line, index) => <p key={`${line}-${index}`}>{line}</p>)}</div></InsightBlock>
    <section className="whatIfCard"><h2>Want to see what could improve this?</h2><p>Adjust only the information you already entered.</p><form onSubmit={runWhatIf}>
      {isRateBased && <label className="sliderField">
        <span>Monthly card spend</span>
        <div className="sliderFieldRow">
          <input
            type="range"
            min={String(SPEND_SLIDER_MIN)}
            max={String(spendSliderMax)}
            step={String(SPEND_SLIDER_STEP)}
            value={sliderValueForDisplay(form.monthly_card_spend, SPEND_SLIDER_MIN, spendSliderMax, SPEND_SLIDER_STEP)}
            onChange={setSliderAmount("monthly_card_spend", spendSliderMax)}
          />
          <input
            type="text"
            inputMode="numeric"
            className="amountTextInput"
            value={formatAmountInput(form.monthly_card_spend)}
            onChange={setTypedAmount("monthly_card_spend")}
            aria-label="Monthly card spend"
            required
            disabled={interactionDisabled}
          />
        </div>
        <div className="sliderEndpoints"><span>{formatAmountInput(String(SPEND_SLIDER_MIN)) || "₹ 0"}</span><span>{formatAmountInput(String(spendSliderMax))}</span></div>
      </label>}
      <label className="sliderField">
        <span>Annual card fee</span>
        <div className="sliderFieldRow">
          <input
            type="range"
            min={String(FEE_SLIDER_MIN)}
            max={String(feeSliderMax)}
            step={String(FEE_SLIDER_STEP)}
            value={sliderValueForDisplay(form.annual_card_fee, FEE_SLIDER_MIN, feeSliderMax, FEE_SLIDER_STEP)}
            onChange={setSliderAmount("annual_card_fee", feeSliderMax)}
          />
          <input
            type="text"
            inputMode="numeric"
            className="amountTextInput"
            value={formatAmountInput(form.annual_card_fee)}
            onChange={setTypedAmount("annual_card_fee")}
            aria-label="Annual card fee"
            required
            disabled={interactionDisabled}
          />
        </div>
        <div className="sliderEndpoints"><span>{formatAmountInput(String(FEE_SLIDER_MIN)) || "₹ 0"}</span><span>{formatAmountInput(String(feeSliderMax))}</span></div>
      </label>
      {form.reward_type === "cashback" && <>
        <FinancialInput label="How much cashback did you receive?" type="number" min="0" required={form.cashback_knowledge === "known" && form.reward_input_basis === "cashback_amount"} value={form.cashback_amount} onChange={set("cashback_amount")} disabled={interactionDisabled} />
        <label className="field"><span>Cashback period</span><select className="selectInput" value={form.reward_period} onChange={setSelect("reward_period")} disabled={interactionDisabled}><option value="monthly">Per month</option>{isTrack11A && <option value="quarterly">Per quarter</option>}<option value="yearly">Per year</option></select></label>
        <label className="checkRow"><input type="checkbox" checked={form.reward_input_basis === "rate_percent"} onChange={(event) => setCashbackPercentageMode(event.target.checked)} disabled={interactionDisabled} />I know my cashback percentage</label>
        {isRateBased && <><FinancialInput label="Estimated reward rate %" type="number" min="0" step="0.1" required value={form.estimated_reward_rate_percent} onChange={set("estimated_reward_rate_percent")} disabled={interactionDisabled} /><p className="staleHint">This estimate assumes the entered cashback percentage applies to the entered spend.</p></>}
        <label className="checkRow"><input type="checkbox" checked={form.cashback_knowledge === "unknown"} onChange={(event) => setCashbackKnowledge(event.target.checked ? "unknown" : "known")} disabled={interactionDisabled} />I&apos;m not sure</label>
      </>}
      {(form.reward_type === "points" || form.reward_type === "miles") && <>
        <label className="field"><span>Do you know the approximate cash value of the rewards you earned in this period?</span><select className="selectInput" value={form.points_miles_knowledge} onChange={(event) => setPointsMilesKnowledge(event.target.value as PointsMilesKnowledge)} required disabled={interactionDisabled}><option value="">Select one</option><option value="yes">Yes, I know the amount</option><option value="unknown">I&apos;m not sure</option></select></label>
        {form.points_miles_knowledge === "yes" && <><FinancialInput label="Approximate reward value (₹)" type="number" min="0" required value={form.reward_value_amount} onChange={set("reward_value_amount")} disabled={interactionDisabled} /><label className="field"><span>Reward period</span><select className="selectInput" value={form.reward_period} onChange={setSelect("reward_period")} disabled={interactionDisabled}><option value="monthly">Per month</option>{isTrack11A && <option value="quarterly">Per quarter</option>}<option value="yearly">Per year</option></select></label><p className="staleHint">Use the value of rewards earned during this period, not your total accumulated balance or a redemption from earlier years.</p></>}
      </>}
      {isUnknownRewardInput && <p className="staleHint">Reward value is unknown. Add a reward value if you learn it, then update estimate.</p>}
      <label className="field"><span>Do you carry a balance forward?</span><select className="selectInput" value={form.interest_input_basis} onChange={(event) => { setInterestBasis(event.target.value as InterestInputBasis); if (isTrack11A) trackEvent("balance_behavior_selected", "money_value", { journeyRunId, cardCheckNumber }); }} disabled={interactionDisabled}><option value="no_balance">No, I pay in full</option><option value="known">Yes, I know my carried balance and interest rate</option><option value="unknown">I&apos;m not sure</option></select></label>
      {form.interest_input_basis === "known" && <><FinancialInput label="Balance carried forward" type="number" min="0" required value={form.revolving_balance} onChange={set("revolving_balance")} disabled={interactionDisabled} /><FinancialInput label="Annual interest rate (%)" type="number" min="0" required value={form.annual_interest_rate_percent} onChange={set("annual_interest_rate_percent")} disabled={interactionDisabled} /></>}
      {form.interest_input_basis === "unknown" && <p className="staleHint">Interest cost will stay unknown until you provide carried balance details.</p>}
      <button className="primaryButton" disabled={interactionDisabled}>{loading ? "Updating estimate..." : "Update estimate"}</button>
      {whatIfError && <div className="errorState" role="alert"><p>{whatIfError}</p><button type="button" className="secondaryButton" onClick={() => { void runWhatIfRequest(); }} disabled={interactionDisabled}>Try again</button></div>}
    </form></section>
    {isStale && <p className="staleHint" role="status">Inputs changed. Update estimate before opening the next-step screens.</p>}
    {isContinuationEnabled && <div className="buttonRow"><button type="button" className="primaryButton" disabled={interactionDisabled || !canOpenContinuation} onClick={() => { trackEvent("result_action_selected", "money_value", { journeyRunId, cardCheckNumber }); setTrackEntryId((previous) => previous + 1); setTrackStep("reveal"); setViewMode("continuation"); }}>See what I could check next</button></div>}
    {error && <ErrorState message={error} />}
  </main>;

  return <main className="shell journey"><a className="backLink" href="/">← Home</a><p className="eyebrow">Get More From My Money</p><h1>See what your card use is worth.</h1><p className="lede">Answer a few questions for an initial estimate.</p>
    <form onSubmit={submit}><FinancialInput label="Monthly card spend" type="number" min="0" required value={form.monthly_card_spend} onChange={set("monthly_card_spend")} disabled={interactionDisabled} /><FinancialInput label="Annual card fee" type="number" min="0" required value={form.annual_card_fee} onChange={set("annual_card_fee")} disabled={interactionDisabled} />
      <section className="rewardChooser"><h2>How does your card reward you?</h2><div className="rewardChooserGrid">
        <button type="button" className={`rewardOption${form.reward_type === "cashback" ? " isSelected" : ""}`} onClick={() => { setRewardType("cashback"); if (isTrack11A) trackEvent("reward_type_selected", "money_value", { journeyRunId, cardCheckNumber }); }} disabled={interactionDisabled}>Cashback</button>
        <button type="button" className={`rewardOption${form.reward_type === "points" ? " isSelected" : ""}`} onClick={() => { setRewardType("points"); if (isTrack11A) trackEvent("reward_type_selected", "money_value", { journeyRunId, cardCheckNumber }); }} disabled={interactionDisabled}>Points</button>
        <button type="button" className={`rewardOption${form.reward_type === "miles" ? " isSelected" : ""}`} onClick={() => { setRewardType("miles"); if (isTrack11A) trackEvent("reward_type_selected", "money_value", { journeyRunId, cardCheckNumber }); }} disabled={interactionDisabled}>Miles</button>
        <button type="button" className={`rewardOption${form.reward_type === "not_sure" ? " isSelected" : ""}`} onClick={() => { setRewardType("not_sure"); if (isTrack11A) trackEvent("reward_type_selected", "money_value", { journeyRunId, cardCheckNumber }); }} disabled={interactionDisabled}>I&apos;m not sure</button>
      </div></section>
      {isTrack11A && <section className="insightBlock" aria-label="Reward value help">
        <h2>Need help finding your reward value?</h2>
        <button type="button" className="secondaryButton" onClick={openRewardHelp} disabled={interactionDisabled || rewardHelpOpen}>Open reward finder</button>
        {rewardHelpOpen && <div className="track11PreviewPanel" role="dialog" aria-label="Reward finder"><p>Choose what best matches what you know right now.</p><div className="track11ButtonStack"><button type="button" className="secondaryButton" onClick={() => selectRewardHelpOutcome("cashback")} disabled={interactionDisabled}>I found my cashback amount</button><button type="button" className="secondaryButton" onClick={() => selectRewardHelpOutcome("points_or_miles")} disabled={interactionDisabled}>I only know points or miles quantity</button><button type="button" className="secondaryButton" onClick={() => selectRewardHelpOutcome("unknown")} disabled={interactionDisabled}>I still can&apos;t estimate rewards</button><button type="button" className="track11TextButton" onClick={() => setRewardHelpOpen(false)} disabled={interactionDisabled}>Close</button></div></div>}
      </section>}
      {form.reward_type === "cashback" && <>
        <FinancialInput label="How much cashback did you receive?" type="number" min="0" required={form.cashback_knowledge === "known" && form.reward_input_basis === "cashback_amount"} value={form.cashback_amount} onChange={set("cashback_amount")} disabled={interactionDisabled} />
        <label className="field"><span>Cashback period</span><select className="selectInput" value={form.reward_period} onChange={setSelect("reward_period")} disabled={interactionDisabled}><option value="monthly">Per month</option>{isTrack11A && <option value="quarterly">Per quarter</option>}<option value="yearly">Per year</option></select></label>
        <label className="checkRow"><input type="checkbox" checked={form.reward_input_basis === "rate_percent"} onChange={(event) => setCashbackPercentageMode(event.target.checked)} disabled={interactionDisabled} />I know my cashback percentage</label>
        {form.reward_input_basis === "rate_percent" && <FinancialInput label="Estimated reward rate %" type="number" min="0" step="0.1" required value={form.estimated_reward_rate_percent} onChange={set("estimated_reward_rate_percent")} disabled={interactionDisabled} />}
        <label className="checkRow"><input type="checkbox" checked={form.cashback_knowledge === "unknown"} onChange={(event) => setCashbackKnowledge(event.target.checked ? "unknown" : "known")} disabled={interactionDisabled} />I&apos;m not sure</label>
      </>}
      {(form.reward_type === "points" || form.reward_type === "miles") && <>
        <label className="field"><span>Do you know the approximate cash value of the rewards you earned in this period?</span><select className="selectInput" value={form.points_miles_knowledge} onChange={(event) => setPointsMilesKnowledge(event.target.value as PointsMilesKnowledge)} required disabled={interactionDisabled}><option value="">Select one</option><option value="yes">Yes, I know the amount</option><option value="unknown">I only know the points or miles quantity</option></select></label>
        {form.points_miles_knowledge === "yes" && <><FinancialInput label="Approximate reward value (₹)" type="number" min="0" required value={form.reward_value_amount} onChange={set("reward_value_amount")} disabled={interactionDisabled} /><label className="field"><span>Reward period</span><select className="selectInput" value={form.reward_period} onChange={setSelect("reward_period")} disabled={interactionDisabled}><option value="monthly">Per month</option>{isTrack11A && <option value="quarterly">Per quarter</option>}<option value="yearly">Per year</option></select></label><p className="staleHint">Use the value of rewards earned during this period, not your total accumulated balance or a redemption from earlier years.</p></>}
        {form.points_miles_knowledge === "unknown" && <><FinancialInput label="Points or miles earned in this period" type="number" min="0" required value={form.reward_units_earned} onChange={set("reward_units_earned")} disabled={interactionDisabled} /><label className="field"><span>Reward period</span><select className="selectInput" value={form.reward_period} onChange={setSelect("reward_period")} disabled={interactionDisabled}><option value="monthly">Per month</option>{isTrack11A && <option value="quarterly">Per quarter</option>}<option value="yearly">Per year</option></select></label><p className="staleHint">We will annualize the quantity you entered, but we will not convert it to rupees without your representative value per point or mile.</p></>}
      </>}
      <label className="field"><span>Do you carry a balance forward?</span><select className="selectInput" value={form.interest_input_basis} onChange={(event) => { setInterestBasis(event.target.value as InterestInputBasis); if (isTrack11A) trackEvent("balance_behavior_selected", "money_value", { journeyRunId, cardCheckNumber }); }} disabled={interactionDisabled}><option value="no_balance">No, I pay in full</option><option value="known">Yes, I know my carried balance and interest rate</option><option value="unknown">I&apos;m not sure</option></select></label>
      {form.interest_input_basis === "known" && <><FinancialInput label="Balance carried forward" type="number" min="0" required value={form.revolving_balance} onChange={set("revolving_balance")} disabled={interactionDisabled} /><FinancialInput label="Annual interest rate (%)" type="number" min="0" required value={form.annual_interest_rate_percent} onChange={set("annual_interest_rate_percent")} disabled={interactionDisabled} /></>}
      {form.interest_input_basis === "unknown" && <p className="staleHint">Interest cost will stay unknown until you provide carried balance details.</p>}
      <div className="formActions"><ExampleValuesButton disabled={interactionDisabled} onClick={() => { setExampleMode(true); setForm({ monthly_card_spend: "75000", annual_card_fee: "4000", estimated_reward_rate_percent: "", reward_type: "cashback", reward_input_basis: "cashback_amount", reward_period: "monthly", reward_value_amount: "", reward_units_earned: "", points_miles_knowledge: "", cashback_knowledge: "known", cashback_amount: "900", reward_value_unknown: false, interest_input_basis: "no_balance", revolving_balance: "", annual_interest_rate_percent: "" }); setSpendSliderMax(nextExpandedMax(SPEND_SLIDER_MAX, 75000, SPEND_SLIDER_EXPAND_BY)); setFeeSliderMax(nextExpandedMax(FEE_SLIDER_MAX, 4000, FEE_SLIDER_EXPAND_BY)); setIsStale(true); }} /><button type="submit" className="primaryButton" disabled={interactionDisabled}>{loading ? "Checking..." : "Check my money value"}</button></div>
    </form>{loading && <LoadingState />}{error && <ErrorState message={error} retry={() => setError("")} />}</main>;
}
