import { cleanup, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const { ensureAnonymousSessionMock, trackEventMock, searchParamsMock } = vi.hoisted(() => ({
  ensureAnonymousSessionMock: vi.fn(),
  trackEventMock: vi.fn(),
  searchParamsMock: new URLSearchParams(),
}));

vi.mock("../../lib/api", () => ({
  ensureAnonymousSession: ensureAnonymousSessionMock,
  trackEvent: trackEventMock,
}));

vi.mock("next/navigation", () => ({
  useSearchParams: () => searchParamsMock,
}));

import { SituationsApp } from "./SituationsApp";

function screenNamesOf(calls: unknown[][]) {
  return calls.map((call) => (call[2] as { screenName?: string })?.screenName);
}

beforeEach(() => {
  ensureAnonymousSessionMock.mockReset();
  ensureAnonymousSessionMock.mockResolvedValue(undefined);
  trackEventMock.mockReset();
  for (const key of Array.from(searchParamsMock.keys())) searchParamsMock.delete(key);
});

afterEach(() => cleanup());

describe("SituationsApp — group chooser view tracking", () => {
  it("reports the chooser's own view once, distinct from any situation's arrival", () => {
    render(<SituationsApp group="borrow" />);

    const groupLandingCalls = trackEventMock.mock.calls.filter(
      (call) => call[0] === "step_viewed" && (call[2] as { screenName?: string })?.screenName === "borrow_group_landing",
    );
    expect(groupLandingCalls).toHaveLength(1);
    expect(groupLandingCalls[0][1]).toBe("comfortable_borrowing");
    // Every call carries its own fresh journeyRunId, not something shared with any situation's own run.
    expect((groupLandingCalls[0][2] as { journeyRunId?: string }).journeyRunId).toEqual(expect.any(String));
  });

  it("reports the rewards group's own screen name on the rewards route", () => {
    render(<SituationsApp group="rewards" />);
    const calls = trackEventMock.mock.calls.filter((c) => (c[2] as { screenName?: string })?.screenName === "rewards_group_landing");
    expect(calls).toHaveLength(1);
    expect(calls[0][1]).toBe("money_value");
  });

  it("does NOT fire when a campaign URL bypasses the chooser entirely", async () => {
    searchParamsMock.set("situation", "offer");
    render(<SituationsApp group="borrow" />);

    await screen.findByRole("heading", { name: "What does this offer really cost?" });
    expect(screenNamesOf(trackEventMock.mock.calls)).not.toContain("borrow_group_landing");
    // The situation's own arrival view still fires, exactly as before this change.
    expect(screenNamesOf(trackEventMock.mock.calls)).toContain("borrow_offer_arrival");
  });

  it("fires again on returning to the chooser, mirroring how a fresh situation re-fires its own arrival", async () => {
    const user = userEvent.setup();
    render(<SituationsApp group="borrow" />);
    expect(screenNamesOf(trackEventMock.mock.calls).filter((n) => n === "borrow_group_landing")).toHaveLength(1);

    await user.click(screen.getAllByRole("button")[0]);
    // Picking a situation does not re-fire the chooser's own view.
    expect(screenNamesOf(trackEventMock.mock.calls).filter((n) => n === "borrow_group_landing")).toHaveLength(1);

    await user.click(screen.getByRole("button", { name: "Choose another situation" }));
    expect(screenNamesOf(trackEventMock.mock.calls).filter((n) => n === "borrow_group_landing")).toHaveLength(2);
  });

  it("still bootstraps the anonymous session on mount, unchanged", () => {
    render(<SituationsApp group="borrow" />);
    expect(ensureAnonymousSessionMock).toHaveBeenCalledTimes(1);
  });
});
