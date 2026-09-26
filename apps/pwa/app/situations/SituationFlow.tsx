"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { ValueBars, type ValueBarRow } from "../../components/journey-ui/ValueBars";
import ui from "../../components/journey-ui/journeyUi.module.css";
import { trackEvent, type ScreenName } from "../../lib/api";
import { createJourneyRunId } from "../../lib/journeySession";
import { PilotInterestForm } from "./PilotInterestForm";
import { ProvenanceBadge, type Provenance } from "./ProvenanceBadge";
import { checkSituation, SituationApiError, type SituationResult } from "./situationsApi";
import { GROUP_COPY, SITUATIONS, type SituationKey } from "./situationsConfig";

export type Step = "arrival" | "inputs" | "result";
type FieldValue = string | number | null;
type Mode = "example" | "mixed" | "own";

function initialValues(key: SituationKey): Record<string, FieldValue> {
  return Object.fromEntries(SITUATIONS[key].fields.map((f) => [f.id, f.example]));
}

function ownModeValues(key: SituationKey): Record<string, FieldValue> {
  return Object.fromEntries(SITUATIONS[key].fields.map((f) => [f.id, typeof f.example === "string" ? f.example : null]));
}

/** Builds the exact JSON body the situation's endpoint expects, coercing numeric-looking strings and
 * dropping a conditional field the situation doesn't currently require. Never includes anything beyond
 * this situation's own fields — no journey_run_id, no cookie-derived value, nothing else. */
function toRequestBody(key: SituationKey, values: Record<string, FieldValue>): Record<string, unknown> {
  const body: Record<string, unknown> = {};
  for (const field of SITUATIONS[key].fields) {
    if (field.showWhen && values[field.showWhen.field] !== field.showWhen.equals) continue; // conditional field not applicable right now
    const raw = values[field.id];
    if (field.type === "select") {
      body[field.id] = String(raw).toLowerCase();
    } else if (raw === null || raw === "") {
      body[field.id] = null;
    } else {
      body[field.id] = typeof raw === "number" ? raw : Number(raw);
    }
  }
  // Map the situation's own field names onto what each endpoint actually calls them, where they differ.
  if (key === "balance" && body.known === "no") delete body.interest;
  if (key === "purchase" || key === "offer") body.months = Math.round(Number(body.months));
  return body;
}

function missingRequiredField(key: SituationKey, values: Record<string, FieldValue>): boolean {
  return SITUATIONS[key].fields.some((f) => {
    if (f.type === "optional" || f.type === "select") return false;
    if (f.type === "conditional" && f.showWhen && values[f.showWhen.field] !== f.showWhen.equals) return false;
    const v = values[f.id];
    return v === null || v === "" || Number.isNaN(Number(v));
  });
}

export function SituationFlow({
  situationKey,
  onExit,
  onStepChange,
}: {
  situationKey: SituationKey;
  onExit: () => void;
  /** Reports the current screen so a wrapping header can show an accurate step count for this 3-screen
   * flow, instead of the 5-step count the original journeys used. Optional: standalone tests render this
   * component without a wrapper and don't need it. */
  onStepChange?: (step: Step) => void;
}) {
  const situation = SITUATIONS[situationKey];
  const journey = GROUP_COPY[situation.group].journey;
  const [journeyRunId] = useState(() => createJourneyRunId());
  const [step, setStep] = useState<Step>("arrival");
  const [mode, setMode] = useState<Mode>("example");
  const [values, setValues] = useState<Record<string, FieldValue>>(() => initialValues(situationKey));
  const [inputError, setInputError] = useState<string | null>(null);
  const [result, setResult] = useState<SituationResult | null>(null);
  const [resultError, setResultError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  const emit = useCallback(
    (eventType: "step_viewed" | "step_completed" | "result_declared" | "situation_pilot_interest_submitted", screenName: ScreenName) => {
      trackEvent(eventType, journey, { journeyRunId, screenName });
    },
    [journey, journeyRunId],
  );

  useEffect(() => {
    if (step === "arrival") emit("step_viewed", `${situation.screenBase}_arrival` as ScreenName);
    if (step === "inputs") emit("step_viewed", `${situation.screenBase}_inputs` as ScreenName);
    onStepChange?.(step);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [step]);

  const provenance: Provenance = mode;

  function chooseMode(next: "example" | "own") {
    setMode(next);
    setValues(next === "example" ? initialValues(situationKey) : ownModeValues(situationKey));
    setInputError(null);
  }

  function updateField(id: string, raw: FieldValue) {
    setValues((prev) => ({ ...prev, [id]: raw }));
    if (mode === "example") setMode("mixed");
    setInputError(null);
  }

  async function submit() {
    if (missingRequiredField(situationKey, values)) {
      setInputError("Enter a non-negative value for each required figure.");
      return;
    }
    emit("step_completed", `${situation.screenBase}_inputs` as ScreenName);
    setLoading(true);
    setResultError(null);
    try {
      const body = toRequestBody(situationKey, values);
      const r = await checkSituation(situationKey, body);
      setResult(r);
      setStep("result");
      emit("result_declared", `${situation.screenBase}_result` as ScreenName);
    } catch (err) {
      setResultError(err instanceof SituationApiError ? err.detail : "Something went wrong. Please try again.");
    } finally {
      setLoading(false);
    }
  }

  const barRows: ValueBarRow[] = useMemo(
    () => (result ? result.bars.map((b) => ({ label: b.label, value: b.value, display: b.value === null ? "Not entered" : formatRupees(b.value), tone: (b.tone as ValueBarRow["tone"]) })) : []),
    [result],
  );

  if (step === "arrival") {
    return (
      <div className={ui.content}>
        <p className={ui.eyebrowTitle}>
          {GROUP_COPY[situation.group].eyebrow} · {situation.nav}
        </p>
        <h2 className={ui.title}>{situation.arrival}</h2>
        <p className={ui.supporting}>{situation.intro}</p>
        <div className={`${ui.card} ${ui.o1}`}>
          <strong className={ui.cardHeading}>{situation.question}</strong>
          <p className={ui.disclaimer} style={{ marginTop: 8 }}>
            Try an example first, or use your own figures. No account or mobile number is needed to see this result.
          </p>
          <button type="button" className={ui.primaryButton} style={{ marginTop: 16 }} onClick={() => setStep("inputs")}>
            Try this check →
          </button>
        </div>
        <div className={ui.actionsRow} style={{ marginTop: 20 }}>
          <button type="button" className={ui.secondaryButton} onClick={onExit}>
            Choose another situation
          </button>
        </div>
      </div>
    );
  }

  if (step === "inputs") {
    return (
      <div className={ui.content}>
        <p className={ui.eyebrowTitle}>A short check · no sign-in</p>
        <h2 className={ui.title}>{situation.question}</h2>
        <p className={ui.supporting}>
          {mode === "example"
            ? "These are illustrative example entries. Change a figure to explore a mixed scenario, or choose Use my figures to enter everything."
            : mode === "mixed"
              ? "This scenario combines example values with your edits. Choose Use my figures for a result based entirely on your entries."
              : "Your result will use the figures you entered."}
        </p>
        <div className={ui.actionsRow} role="group" aria-label="Choose how to fill this check">
          <button type="button" className={mode !== "own" ? ui.tabActive : ui.tab} onClick={() => chooseMode("example")}>
            Try example data
          </button>
          <button type="button" className={mode === "own" ? ui.tabActive : ui.tab} onClick={() => chooseMode("own")}>
            Use my figures
          </button>
        </div>
        <form
          className={ui.form}
          style={{ marginTop: 16 }}
          onSubmit={(e) => {
            e.preventDefault();
            void submit();
          }}
        >
          {situation.fields.map((field) => {
            if (field.showWhen && values[field.showWhen.field] !== field.showWhen.equals) return null;
            const value = values[field.id];
            if (field.type === "select" && field.options) {
              return (
                <label key={field.id} className={ui.field}>
                  <span className={ui.fieldLabel}>{field.label}</span>
                  <select
                    className={ui.select}
                    value={String(value ?? "").toLowerCase()}
                    onChange={(e) => updateField(field.id, e.target.value)}
                  >
                    {field.options.map((opt) => (
                      <option key={opt} value={opt.toLowerCase()}>
                        {opt}
                      </option>
                    ))}
                  </select>
                </label>
              );
            }
            return (
              <label key={field.id} className={ui.field}>
                <span className={ui.fieldLabel}>
                  {field.label}
                  {field.type === "optional" ? " · optional" : ""}
                </span>
                <input
                  className={ui.input}
                  type="number"
                  inputMode="decimal"
                  min={0}
                  value={value === null ? "" : value}
                  placeholder={field.type === "optional" ? "Leave blank if unknown" : "Enter amount"}
                  onChange={(e) => updateField(field.id, e.target.value === "" ? null : e.target.value)}
                />
                {field.type === "optional" ? <small className={ui.rateNote}>Leave blank if you do not know it; no value will be assumed.</small> : null}
              </label>
            );
          })}
          {inputError ? (
            <p className={ui.errorText} role="alert">
              {inputError}
            </p>
          ) : null}
          {resultError ? (
            <p className={`${ui.notice} ${ui.noticeWarn}`} role="alert">
              {resultError}
            </p>
          ) : null}
          <div className={ui.actionsRow} style={{ marginTop: 16 }}>
            <button type="submit" className={ui.primaryButton} disabled={loading}>
              {loading ? "Calculating…" : "See the result →"}
            </button>
            <button type="button" className={ui.secondaryButton} onClick={() => setStep("arrival")}>
              Back to the question
            </button>
          </div>
        </form>
      </div>
    );
  }

  // step === "result"
  if (!result) return null;
  return (
    <div className={ui.content} style={{ maxWidth: 1200 }}>
      <p className={ui.eyebrowTitle}>
        {situation.nav} · result
      </p>
      <h2 className={ui.title}>{situation.question}</h2>
      <ProvenanceBadge provenance={provenance} />
      <div className={ui.grid}>
        <div className={ui.colMain}>
          <div className={ui.darkPanel}>
            <p className={ui.darkLabel}>{result.title}</p>
            <p className={ui.darkValue}>{result.headline}</p>
            <p className={ui.darkNote}>{result.detail}</p>
          </div>
          <div className={ui.insightCard}>
            <p className={ui.insightTitle}>What this tells you</p>
            <p className={ui.insightBody}>{result.insight}</p>
          </div>
          <div className={ui.insightCard}>
            <p className={ui.insightTitle}>What if?</p>
            <p className={ui.insightBody}>{result.scenario}</p>
          </div>
          <div className={`${ui.notice}`}>
            <strong>What this cannot tell you yet</strong>
            <p style={{ margin: "6px 0 0" }}>{situation.gap}</p>
          </div>
          <div className={ui.actionsRow} style={{ marginTop: 16 }}>
            <button type="button" className={ui.secondaryButton} onClick={() => setStep("inputs")}>
              Adjust figures
            </button>
            <button type="button" className={ui.linkButton} onClick={onExit}>
              Explore another situation
            </button>
          </div>
          <PilotInterestForm situationKey={situationKey} onEmit={emit} />
        </div>
        <div className={ui.colSide}>
          <div className={ui.card}>
            <h3 className={ui.cardHeading}>{result.title}</h3>
            {barRows.length ? <ValueBars summary={result.title} rows={barRows} /> : <p className={ui.disclaimer}>There is no trustworthy rupee chart without a value to compare.</p>}
            <p className={ui.disclaimer} style={{ marginTop: 12 }}>
              {result.note}
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}

function formatRupees(value: number): string {
  const sign = value < 0 ? "−" : "";
  return `${sign}₹${Math.round(Math.abs(value)).toLocaleString("en-IN")}`;
}
