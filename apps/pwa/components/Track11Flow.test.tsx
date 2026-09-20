import { StrictMode, useState } from "react";
import { render } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { BorrowBetterContinuationFlow, MoneyValueContinuationFlow, type Track11ContinuationStep } from "./Track11Flow";

const { trackEventMock } = vi.hoisted(() => ({ trackEventMock: vi.fn() }));

vi.mock("../lib/api", () => ({
  trackEvent: trackEventMock,
}));

describe("MoneyValueContinuationFlow analytics", () => {
  it("emits exactly one view event per logical entry and step", () => {
    trackEventMock.mockReset();

    const props = {
      journey: "money_value" as const,
      journeyRunId: "run-1",
      step: "reveal" as const,
      logicalEntryId: 1,
      resultVariant: "original" as const,
      onNavigate: vi.fn(),
      onReturnToResult: vi.fn(),
      netAnnualValue: "₹6,800",
    };

    const firstRender = render(
      <StrictMode>
        <MoneyValueContinuationFlow {...props} />
      </StrictMode>,
    );

    expect(trackEventMock.mock.calls.filter(([eventType]) => eventType === "teaser_viewed")).toHaveLength(1);

    firstRender.rerender(
      <StrictMode>
        <MoneyValueContinuationFlow {...props} />
      </StrictMode>,
    );

    expect(trackEventMock.mock.calls.filter(([eventType]) => eventType === "teaser_viewed")).toHaveLength(1);

    firstRender.unmount();

    const secondRender = render(
      <StrictMode>
        <MoneyValueContinuationFlow {...props} />
      </StrictMode>,
    );

    expect(trackEventMock.mock.calls.filter(([eventType]) => eventType === "teaser_viewed")).toHaveLength(1);

    secondRender.rerender(
      <StrictMode>
        <MoneyValueContinuationFlow
          {...props}
          step="intent"
        />
      </StrictMode>,
    );

    expect(trackEventMock.mock.calls.filter(([eventType]) => eventType === "next_interest_viewed")).toHaveLength(1);

    secondRender.rerender(
      <StrictMode>
        <MoneyValueContinuationFlow
          {...props}
          step="reveal"
          logicalEntryId={2}
        />
      </StrictMode>,
    );

    expect(trackEventMock.mock.calls.filter(([eventType]) => eventType === "teaser_viewed")).toHaveLength(2);
  });

  it("emits action events once per explicit click", async () => {
    trackEventMock.mockReset();
    const onNavigate = vi.fn();
    const user = (await import("@testing-library/user-event")).default.setup();
    const { getByRole } = render(
      <MoneyValueContinuationFlow
        journey="money_value"
        journeyRunId="run-9"
        step="reveal"
        logicalEntryId={9}
        resultVariant="original"
        onNavigate={onNavigate}
        onReturnToResult={() => {}}
        netAnnualValue="₹6,800"
      />,
    );

    await user.click(getByRole("button", { name: "See what I could check next" }));

    expect(trackEventMock.mock.calls.filter(([eventType]) => eventType === "teaser_cta_selected")).toHaveLength(1);
    expect(onNavigate).toHaveBeenCalledTimes(1);
  });

  it("suppresses rapid double-tap on reveal CTA to one event and one navigation", async () => {
    trackEventMock.mockReset();
    const onNavigate = vi.fn();
    const user = (await import("@testing-library/user-event")).default.setup();

    const { getByRole } = render(
      <MoneyValueContinuationFlow
        journey="money_value"
        journeyRunId="run-double-reveal"
        step="reveal"
        logicalEntryId={30}
        resultVariant="original"
        onNavigate={onNavigate}
        onReturnToResult={() => {}}
        netAnnualValue="₹6,800"
      />,
    );

    await user.dblClick(getByRole("button", { name: "See what I could check next" }));

    expect(trackEventMock.mock.calls.filter(([eventType]) => eventType === "teaser_cta_selected")).toHaveLength(1);
    expect(onNavigate).toHaveBeenCalledTimes(1);
  });

  it("suppresses rapid double-tap on intent card to one event and one navigation", async () => {
    trackEventMock.mockReset();
    const onNavigate = vi.fn();
    const user = (await import("@testing-library/user-event")).default.setup();

    const { getByRole } = render(
      <MoneyValueContinuationFlow
        journey="money_value"
        journeyRunId="run-double-intent"
        step="intent"
        logicalEntryId={31}
        resultVariant="original"
        onNavigate={onNavigate}
        onReturnToResult={() => {}}
        netAnnualValue="₹6,800"
      />,
    );

    await user.dblClick(getByRole("button", { name: /Understand my rewards and costs/ }));

    expect(trackEventMock.mock.calls.filter(([eventType]) => eventType === "next_interest_selected")).toHaveLength(1);
    expect(onNavigate).toHaveBeenCalledTimes(1);
  });

  it("allows a legitimate next action after moving to the next step", async () => {
    trackEventMock.mockReset();
    const user = (await import("@testing-library/user-event")).default.setup();

    function Harness() {
      const [step, setStep] = useState<Track11ContinuationStep>("reveal");
      return (
        <MoneyValueContinuationFlow
          journey="money_value"
          journeyRunId="run-harness"
          step={step}
          logicalEntryId={32}
          resultVariant="original"
          onNavigate={setStep}
          onReturnToResult={() => {}}
          netAnnualValue="₹6,800"
        />
      );
    }

    const { getByRole, findByRole } = render(<Harness />);

    await user.click(getByRole("button", { name: "See what I could check next" }));
    await findByRole("heading", { name: "What would be most useful next?" });
    await user.click(getByRole("button", { name: /Understand my rewards and costs/ }));
    await findByRole("heading", { name: "Here's what you could check next" });

    expect(trackEventMock.mock.calls.filter(([eventType]) => eventType === "teaser_cta_selected")).toHaveLength(1);
    expect(trackEventMock.mock.calls.filter(([eventType]) => eventType === "next_interest_selected")).toHaveLength(1);
    expect(trackEventMock.mock.calls.filter(([eventType]) => eventType === "step_completed").length).toBeGreaterThanOrEqual(2);
  });

  it("emits pilot and journey completion events when yes action is selected", async () => {
    trackEventMock.mockReset();
    const user = (await import("@testing-library/user-event")).default.setup();

    function YesPathHarness() {
      const [step, setStep] = useState<Track11ContinuationStep>("intent");
      return (
        <MoneyValueContinuationFlow
          journey="money_value"
          journeyRunId="run-yes-path"
          step={step}
          logicalEntryId={60}
          resultVariant="original"
          onNavigate={setStep}
          onReturnToResult={() => {}}
          netAnnualValue="₹6,800"
        />
      );
    }

    const { getByRole, findByRole } = render(<YesPathHarness />);

    await user.click(getByRole("button", { name: /Understand my rewards and costs/ }));
    await findByRole("heading", { name: "Here's what you could check next" });
    await user.click(getByRole("button", { name: "I'd use this when available" }));
    await findByRole("heading", { name: "Thanks for letting us know" });

    expect(trackEventMock.mock.calls.filter(([eventType]) => eventType === "pilot_cta_selected")).toHaveLength(1);
    expect(trackEventMock.mock.calls.filter(([eventType]) => eventType === "journey_completed").length).toBeGreaterThanOrEqual(1);
  });

  it("does not persist tap-lock across logical entries", async () => {
    trackEventMock.mockReset();
    const onNavigate = vi.fn();
    const user = (await import("@testing-library/user-event")).default.setup();

    const { getByRole, rerender } = render(
      <MoneyValueContinuationFlow
        journey="money_value"
        journeyRunId="run-reentry"
        step="reveal"
        logicalEntryId={40}
        resultVariant="original"
        onNavigate={onNavigate}
        onReturnToResult={() => {}}
        netAnnualValue="₹6,800"
      />,
    );

    await user.click(getByRole("button", { name: "See what I could check next" }));

    rerender(
      <MoneyValueContinuationFlow
        journey="money_value"
        journeyRunId="run-reentry"
        step="reveal"
        logicalEntryId={41}
        resultVariant="original"
        onNavigate={onNavigate}
        onReturnToResult={() => {}}
        netAnnualValue="₹6,800"
      />,
    );

    await user.click(getByRole("button", { name: "See what I could check next" }));

    expect(trackEventMock.mock.calls.filter(([eventType]) => eventType === "teaser_cta_selected")).toHaveLength(2);
  });
});

describe("BorrowBetterContinuationFlow tap lock", () => {
  it("suppresses rapid double-tap on no action to one event and one navigation", async () => {
    trackEventMock.mockReset();
    const onNavigate = vi.fn();
    const user = (await import("@testing-library/user-event")).default.setup();

    const { getByRole } = render(
      <BorrowBetterContinuationFlow
        journey="comfortable_borrowing"
        journeyRunId="borrow-run-1"
        step="closure"
        logicalEntryId={50}
        resultVariant="original"
        onNavigate={onNavigate}
        onReturnToResult={() => {}}
        statusLabel="Proceed carefully"
        commitmentRatio="42.1%"
      />,
    );

    await user.dblClick(getByRole("button", { name: "Not for me right now" }));

    expect(trackEventMock.mock.calls.filter(([eventType]) => eventType === "go_deeper_declined")).toHaveLength(1);
    expect(onNavigate).toHaveBeenCalledTimes(1);
  });

  it("allows back then yes flow after decline path is opened", async () => {
    trackEventMock.mockReset();
    const user = (await import("@testing-library/user-event")).default.setup();

    function BorrowHarness() {
      const [step, setStep] = useState<Track11ContinuationStep>("closure");
      return (
        <BorrowBetterContinuationFlow
          journey="comfortable_borrowing"
          journeyRunId="borrow-run-2"
          step={step}
          logicalEntryId={51}
          resultVariant="original"
          onNavigate={setStep}
          onReturnToResult={() => {}}
          statusLabel="Proceed carefully"
          commitmentRatio="42.1%"
        />
      );
    }

    const { getByRole, findByRole } = render(<BorrowHarness />);

    await user.click(getByRole("button", { name: "Not for me right now" }));
    await findByRole("heading", { name: "What's the main reason?" });
    await user.click(getByRole("link", { name: "← Back to preview" }));
    await findByRole("heading", { name: "Here's what you could check next" });
    await user.click(getByRole("button", { name: "I'd use this when available" }));
    await findByRole("heading", { name: "Thanks for letting us know" });

    expect(trackEventMock.mock.calls.filter(([eventType]) => eventType === "go_deeper_declined")).toHaveLength(1);
    expect(trackEventMock.mock.calls.filter(([eventType]) => eventType === "go_deeper_selected")).toHaveLength(1);
  });
});