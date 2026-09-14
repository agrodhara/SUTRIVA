"use client";

import { useEffect, useRef, useState, type RefObject } from "react";
import { Journey, ProductEventIntent, ProductEventReason, trackEvent } from "../lib/api";

export type Track11ResultVariant = "original" | "what_if";

export type Track11ContinuationStep =
  | "reveal"
  | "intent"
  | "closure"
  | "decline_reason"
  | "yes_terminal"
  | "no_terminal"
  | "skip_terminal";

type Option<T extends string> = {
  value: T;
  title: string;
  body?: string;
};

type TerminalCopy = {
  title: string;
  body: string;
};

type FlowConfig<TIntent extends ProductEventIntent, TReason extends ProductEventReason> = {
  resultLink: {
    title: string;
    label: string;
    value: string;
    caption?: string;
    captionLabel?: string;
    body: string;
    bridgeLabel: string;
    bridgeText: string;
    primaryCta: string;
  };
  intent: {
    title: string;
    options: Option<TIntent>[];
    skipLabel: string;
    skipTerminal: TerminalCopy;
  };
  closure: {
    badge: string;
    title: string;
    benefits: Record<TIntent, string[]>;
    disclosure: string;
    question: string;
    yesLabel: string;
    noLabel: string;
    noReason: {
      title: string;
      helper: string;
      reasons: Option<TReason>[];
      finishLabel: string;
    };
    yesTerminal: TerminalCopy;
    noTerminal: TerminalCopy;
  };
};

type FlowProps<TIntent extends ProductEventIntent, TReason extends ProductEventReason> = {
  journey: Journey;
  step: Track11ContinuationStep;
  logicalEntryId: number;
  resultVariant: Track11ResultVariant;
  returnLabel?: string;
  onNavigate: (step: Track11ContinuationStep) => void;
  onReturnToResult: () => void;
  config: FlowConfig<TIntent, TReason>;
};

const VIEW_EVENT_STORAGE_PREFIX = "track11:view-entry:";

function viewEntryKey(journey: Journey, step: "reveal" | "intent", logicalEntryId: number): string {
  return `${journey}:${step}:${logicalEntryId}`;
}

function hasViewEntryBeenTracked(key: string): boolean {
  if (typeof window === "undefined") return false;
  try {
    return window.sessionStorage.getItem(`${VIEW_EVENT_STORAGE_PREFIX}${key}`) === "1";
  } catch {
    return false;
  }
}

function markViewEntryTracked(key: string): void {
  if (typeof window === "undefined") return;
  try {
    window.sessionStorage.setItem(`${VIEW_EVENT_STORAGE_PREFIX}${key}`, "1");
  } catch {
    // Best effort only. If storage is unavailable, component-local dedupe still applies.
  }
}

function useHeadingFocus(step: Track11ContinuationStep) {
  const headingRef = useRef<HTMLHeadingElement>(null);

  useEffect(() => {
    headingRef.current?.focus();
  }, [step]);

  return headingRef;
}

function resultBackLabel(resultVariant: Track11ResultVariant, returnLabel?: string) {
  if (returnLabel) return returnLabel;
  return resultVariant === "what_if" ? "← Back to what-if" : "← Back to my estimate";
}

function TerminalScreen({
  title,
  body,
  resultVariant,
  returnLabel,
  headingRef,
  onReturnToResult,
}: TerminalCopy & {
  resultVariant: Track11ResultVariant;
  returnLabel?: string;
  headingRef: RefObject<HTMLHeadingElement>;
  onReturnToResult: () => void;
}) {
  return (
    <section className="track11Screen">
      <a className="backLink" href="#" onClick={(event) => { event.preventDefault(); onReturnToResult(); }}>
        {resultBackLabel(resultVariant, returnLabel)}
      </a>
      <p className="track11Badge">Possible next step</p>
      <h1 tabIndex={-1} ref={headingRef}>
        {title}
      </h1>
      <p className="track11TerminalBody">{body}</p>
      <div className="track11TerminalActions">
        <button type="button" className="primaryButton" onClick={onReturnToResult}>
          {resultBackLabel(resultVariant, returnLabel)}
        </button>
        <a className="track11HomeLink" href="/">
          Back to home
        </a>
      </div>
    </section>
  );
}

function ContinuationFlow<TIntent extends ProductEventIntent, TReason extends ProductEventReason>({
  journey,
  step,
  logicalEntryId,
  resultVariant,
  returnLabel,
  onNavigate,
  onReturnToResult,
  config,
}: FlowProps<TIntent, TReason>) {
  const headingRef = useHeadingFocus(step);
  const [selectedIntent, setSelectedIntent] = useState<TIntent>(config.intent.options[0].value);
  const trackedViewEntries = useRef<Set<string>>(new Set());
  const inFlightActions = useRef<Set<string>>(new Set());

  const runActionOnce = (actionKey: string, action: () => void) => {
    const scopedKey = `${journey}:${logicalEntryId}:${actionKey}`;
    if (inFlightActions.current.has(scopedKey)) return;

    inFlightActions.current.add(scopedKey);
    try {
      action();
    } finally {
      queueMicrotask(() => {
        inFlightActions.current.delete(scopedKey);
      });
    }
  };

  useEffect(() => {
    if (step !== "reveal" && step !== "intent") return;

    const entryKey = viewEntryKey(journey, step, logicalEntryId);
    if (trackedViewEntries.current.has(entryKey) || hasViewEntryBeenTracked(entryKey)) {
      trackedViewEntries.current.add(entryKey);
      return;
    }

    trackedViewEntries.current.add(entryKey);
    markViewEntryTracked(entryKey);

    if (step === "reveal") trackEvent("teaser_viewed", journey);
    if (step === "intent") trackEvent("next_interest_viewed", journey);
  }, [journey, logicalEntryId, step]);

  if (step === "yes_terminal") {
    return (
      <TerminalScreen
        title={config.closure.yesTerminal.title}
        body={config.closure.yesTerminal.body}
        resultVariant={resultVariant}
        returnLabel={returnLabel}
        headingRef={headingRef}
        onReturnToResult={onReturnToResult}
      />
    );
  }

  if (step === "no_terminal") {
    return (
      <TerminalScreen
        title={config.closure.noTerminal.title}
        body={config.closure.noTerminal.body}
        resultVariant={resultVariant}
        returnLabel={returnLabel}
        headingRef={headingRef}
        onReturnToResult={onReturnToResult}
      />
    );
  }

  if (step === "skip_terminal") {
    return (
      <TerminalScreen
        title={config.intent.skipTerminal.title}
        body={config.intent.skipTerminal.body}
        resultVariant={resultVariant}
        returnLabel={returnLabel}
        headingRef={headingRef}
        onReturnToResult={onReturnToResult}
      />
    );
  }

  if (step === "intent") {
    return (
      <section className="track11Screen">
        <a className="backLink" href="#" onClick={(event) => { event.preventDefault(); onNavigate("reveal"); }}>
          ← Back to reveal
        </a>
        <h1 tabIndex={-1} ref={headingRef}>
          {config.intent.title}
        </h1>
        <div className="track11ChoiceStack" role="list">
          {config.intent.options.map((option) => (
            <button
              key={option.value}
              type="button"
              className="track11ChoiceCard"
              onClick={() => {
                runActionOnce(`next_interest_selected:${option.value}`, () => {
                  setSelectedIntent(option.value);
                  trackEvent("next_interest_selected", journey, { intent: option.value });
                  onNavigate("closure");
                });
              }}
            >
              <span className="track11ChoiceCard__content">
                <span className="track11ChoiceCard__title">{option.title}</span>
                <span className="track11ChoiceCard__body">{option.body}</span>
              </span>
              <span className="track11ChoiceCard__chevron" aria-hidden="true">
                →
              </span>
            </button>
          ))}
        </div>
        <button
          type="button"
          className="track11TextButton"
          onClick={() => {
            trackEvent("next_interest_skipped", journey);
            onNavigate("skip_terminal");
          }}
        >
          {config.intent.skipLabel}
        </button>
      </section>
    );
  }

  if (step === "closure") {
    return (
      <section className="track11Screen">
        <a className="backLink" href="#" onClick={(event) => { event.preventDefault(); onNavigate("intent"); }}>
          ← Back to choices
        </a>
        <p className="track11Badge">{config.closure.badge}</p>
        <h1 tabIndex={-1} ref={headingRef}>
          {config.closure.title}
        </h1>
        <section className="track11PreviewPanel" aria-label="Possible next step preview">
          <ul className="track11RowList">
            {config.closure.benefits[selectedIntent].map((row) => (
              <li key={row} className="track11Row">
                {row}
              </li>
            ))}
          </ul>
        </section>
        <p className="track11Disclosure">{config.closure.disclosure}</p>
        <hr className="track11Divider" />
        <h2 className="track11Question">{config.closure.question}</h2>
        <div className="track11ButtonStack">
          <button
            type="button"
            className="primaryButton"
            onClick={() => {
              trackEvent("go_deeper_selected", journey, { intent: selectedIntent });
              onNavigate("yes_terminal");
            }}
          >
            {config.closure.yesLabel}
          </button>
          <button
            type="button"
            className="secondaryButton"
            onClick={() => {
              trackEvent("go_deeper_declined", journey, { intent: selectedIntent });
              onNavigate("decline_reason");
            }}
          >
            {config.closure.noLabel}
          </button>
        </div>
      </section>
    );
  }

  if (step === "decline_reason") {
    return (
      <section className="track11Screen">
        <a className="backLink" href="#" onClick={(event) => { event.preventDefault(); onNavigate("closure"); }}>
          ← Back to preview
        </a>
        <h1 tabIndex={-1} ref={headingRef}>
          {config.closure.noReason.title}
        </h1>
        <p className="track11Disclosure">{config.closure.noReason.helper}</p>
        <div className="track11ReasonStack">
          {config.closure.noReason.reasons.map((reason) => (
            <button
              key={reason.value}
              type="button"
              className="track11TextButton track11ReasonButton"
              onClick={() => {
                trackEvent("decline_reason_selected", journey, { intent: selectedIntent, reason: reason.value });
                onNavigate("no_terminal");
              }}
            >
              {reason.title}
            </button>
          ))}
          <button type="button" className="secondaryButton track11FinishButton" onClick={() => onNavigate("no_terminal")}>
            {config.closure.noReason.finishLabel}
          </button>
        </div>
      </section>
    );
  }

  return (
    <section className="track11Screen">
      <a className="backLink" href="#" onClick={(event) => { event.preventDefault(); onReturnToResult(); }}>
        {resultBackLabel(resultVariant, returnLabel)}
      </a>
      <p className="track11Eyebrow">{config.resultLink.label}</p>
      <h1 tabIndex={-1} ref={headingRef}>
        {config.resultLink.title}
      </h1>
      <p className="track11HeroLabel">{config.resultLink.label}</p>
      <section className="track11HeroCard">
        <p className="track11HeroValue">{config.resultLink.value}</p>
        {config.resultLink.caption && (
          <p className="track11HeroCaption">
            {config.resultLink.captionLabel && <span className="track11HeroCaptionLabel">{config.resultLink.captionLabel}</span>}
            <span>{config.resultLink.caption}</span>
          </p>
        )}
      </section>
      <p className="track11Body">{config.resultLink.body}</p>
      <section className="track11BridgeCard">
        <p className="track11BridgeLabel">{config.resultLink.bridgeLabel}</p>
        <p className="track11BridgeText">{config.resultLink.bridgeText}</p>
      </section>
      <button
        type="button"
        className="primaryButton track11PrimaryButton"
        onClick={() => {
          runActionOnce("teaser_cta_selected", () => {
            trackEvent("teaser_cta_selected", journey);
            onNavigate("intent");
          });
        }}
      >
        {config.resultLink.primaryCta}
      </button>
    </section>
  );
}

export function BorrowBetterContinuationFlow({
  journey,
  step,
  logicalEntryId,
  resultVariant,
  returnLabel,
  onNavigate,
  onReturnToResult,
  statusLabel,
  commitmentRatio,
}: {
  journey: Journey;
  step: Track11ContinuationStep;
  logicalEntryId: number;
  resultVariant: Track11ResultVariant;
  returnLabel?: string;
  onNavigate: (step: Track11ContinuationStep) => void;
  onReturnToResult: () => void;
  statusLabel: string;
  commitmentRatio: string;
}) {
  return (
    <ContinuationFlow
      journey={journey}
      step={step}
      logicalEntryId={logicalEntryId}
      resultVariant={resultVariant}
      returnLabel={returnLabel}
      onNavigate={onNavigate}
      onReturnToResult={onReturnToResult}
      config={{
        resultLink: {
          title: "Your answer is based on what you told us",
          label: resultVariant === "what_if" ? "YOUR WHAT-IF ESTIMATE" : "YOUR ESTIMATE",
          value: statusLabel,
          caption: commitmentRatio,
          captionLabel: "Commitment-to-income ratio",
          body: "Loans, card balances or other commitments not included here could change this picture.",
          bridgeLabel: "With your actual obligations",
          bridgeText: "Check whether the same answer still holds.",
          primaryCta: "See what I could check next",
        },
        intent: {
          title: "What would be most useful next?",
          options: [
            {
              value: "actual_obligations",
              title: "My actual obligations",
              body: "Check whether the loans and cards I already have change this result.",
            },
            {
              value: "improve_readiness",
              title: "How I could improve this",
              body: "Show me what could strengthen my borrowing position.",
            },
          ],
          skipLabel: "I'm only exploring for now",
          skipTerminal: {
            title: "Explore at your own pace",
            body: "You can return to your estimate whenever you're ready in this session.",
          },
        },
        closure: {
          badge: "Possible next step",
          title: "Here's what you could check next",
          benefits: {
            actual_obligations: [
              "Your loans and card commitments",
              "How they affect your borrowing estimate",
              "Details to check before you borrow",
            ],
            improve_readiness: [
              "Which commitments affect your estimate",
              "Changes that could improve your position",
              "What to review before applying",
            ],
          },
          disclosure:
            "This isn't available yet. A future check would need your permission to access credit information. Nothing is accessed here.",
          question: "Would you use this?",
          yesLabel: "I'd use this when available",
          noLabel: "Not for me right now",
          noReason: {
            title: "What's the main reason?",
            helper: "Optional — choose one, or finish without answering.",
            reasons: [
              { value: "not_needed_now", title: "I don't need it now" },
              { value: "trust_data_access", title: "I'd need to trust the data access" },
              { value: "current_answer_enough", title: "The current answer is enough" },
              { value: "other", title: "Something else" },
            ],
            finishLabel: "Finish",
          },
          yesTerminal: {
            title: "Thanks for letting us know",
            body: "This helps us understand what to build next. You haven't signed up or shared any additional financial data.",
          },
          noTerminal: {
            title: "Thanks for the feedback",
            body: "You can keep exploring with the estimate you already have.",
          },
        },
      }}
    />
  );
}

export function MoneyValueContinuationFlow({
  journey,
  step,
  logicalEntryId,
  resultVariant,
  returnLabel,
  onNavigate,
  onReturnToResult,
  netAnnualValue,
}: {
  journey: Journey;
  step: Track11ContinuationStep;
  logicalEntryId: number;
  resultVariant: Track11ResultVariant;
  returnLabel?: string;
  onNavigate: (step: Track11ContinuationStep) => void;
  onReturnToResult: () => void;
  netAnnualValue: string;
}) {
  return (
    <ContinuationFlow
      journey={journey}
      step={step}
      logicalEntryId={logicalEntryId}
      resultVariant={resultVariant}
      returnLabel={returnLabel}
      onNavigate={onNavigate}
      onReturnToResult={onReturnToResult}
      config={{
        resultLink: {
          title: "Your estimate is only part of the story",
          label: resultVariant === "what_if" ? "YOUR WHAT-IF ESTIMATE" : "YOUR ESTIMATE",
          value: netAnnualValue,
          caption: "Estimated net annual card value",
          body: "Your statement could help check rewards, fees and interest, and show where your spending went.",
          bridgeLabel: "With your actual statement",
          bridgeText: "Compare the estimate with recorded card activity.",
          primaryCta: "See what I could check next",
        },
        intent: {
          title: "What would be most useful next?",
          options: [
            {
              value: "actual_card_value",
              title: "Understand my rewards and costs",
              body: "Check the reward value and charges behind my estimate.",
            },
            {
              value: "spend_understanding",
              title: "Understand my spending",
              body: "Show me the categories and patterns behind my card use.",
            },
          ],
          skipLabel: "I'm only exploring for now",
          skipTerminal: {
            title: "Explore at your own pace",
            body: "You can return to your estimate whenever you're ready in this session.",
          },
        },
        closure: {
          badge: "Possible next step",
          title: "Here's what you could check next",
          benefits: {
            actual_card_value: [
              "Rewards recorded on your statement",
              "Fees and interest reducing that value",
              "How this compares with your estimate",
            ],
            spend_understanding: [
              "Your spending by category",
              "Recurring payments on your card",
              "Patterns across the period provided",
            ],
          },
          disclosure:
            "A statement could help check spending and charges. Reward value may need additional details.",
          question: "Would you use this?",
          yesLabel: "I'd use this when available",
          noLabel: "Not for me right now",
          noReason: {
            title: "What's the main reason?",
            helper: "Optional — choose one, or finish without answering.",
            reasons: [
              { value: "current_answer_enough", title: "The estimate is enough" },
              { value: "statement_sharing_declined", title: "I wouldn't share a statement" },
              { value: "not_useful", title: "This isn't useful to me" },
              { value: "other", title: "Something else" },
            ],
            finishLabel: "Finish",
          },
          yesTerminal: {
            title: "Thanks for letting us know",
            body: "This helps us understand what to build next. You haven't signed up or shared any additional financial data.",
          },
          noTerminal: {
            title: "Thanks for the feedback",
            body: "You can keep exploring with the estimate you already have.",
          },
        },
      }}
    />
  );
}
