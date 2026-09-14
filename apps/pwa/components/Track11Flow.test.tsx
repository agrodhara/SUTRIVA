import { StrictMode } from "react";
import { render } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { MoneyValueContinuationFlow } from "./Track11Flow";

const { trackEventMock } = vi.hoisted(() => ({ trackEventMock: vi.fn() }));

vi.mock("../lib/api", () => ({
  trackEvent: trackEventMock,
}));

describe("MoneyValueContinuationFlow analytics", () => {
  it("emits view events once per genuine step entry under StrictMode", () => {
    trackEventMock.mockReset();

    const { rerender } = render(
      <StrictMode>
        <MoneyValueContinuationFlow
          journey="money_value"
          step="reveal"
          resultVariant="original"
          onNavigate={() => {}}
          onReturnToResult={() => {}}
          netAnnualValue="₹6,800"
        />
      </StrictMode>,
    );

    expect(trackEventMock.mock.calls.filter(([eventType]) => eventType === "teaser_viewed")).toHaveLength(1);

    rerender(
      <StrictMode>
        <MoneyValueContinuationFlow
          journey="money_value"
          step="reveal"
          resultVariant="original"
          onNavigate={() => {}}
          onReturnToResult={() => {}}
          netAnnualValue="₹6,800"
        />
      </StrictMode>,
    );

    expect(trackEventMock.mock.calls.filter(([eventType]) => eventType === "teaser_viewed")).toHaveLength(1);

    rerender(
      <StrictMode>
        <MoneyValueContinuationFlow
          journey="money_value"
          step="intent"
          resultVariant="original"
          onNavigate={() => {}}
          onReturnToResult={() => {}}
          netAnnualValue="₹6,800"
        />
      </StrictMode>,
    );

    expect(trackEventMock.mock.calls.filter(([eventType]) => eventType === "next_interest_viewed")).toHaveLength(1);

    rerender(
      <StrictMode>
        <MoneyValueContinuationFlow
          journey="money_value"
          step="reveal"
          resultVariant="original"
          onNavigate={() => {}}
          onReturnToResult={() => {}}
          netAnnualValue="₹6,800"
        />
      </StrictMode>,
    );

    expect(trackEventMock.mock.calls.filter(([eventType]) => eventType === "teaser_viewed")).toHaveLength(2);
  });
});