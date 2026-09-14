import { StrictMode } from "react";
import { render } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { MoneyValueContinuationFlow } from "./Track11Flow";

const { trackEventMock } = vi.hoisted(() => ({ trackEventMock: vi.fn() }));

vi.mock("../lib/api", () => ({
  trackEvent: trackEventMock,
}));

describe("MoneyValueContinuationFlow analytics", () => {
  it("emits exactly one view event per logical entry and step", () => {
    trackEventMock.mockReset();

    const props = {
      journey: "money_value" as const,
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
});