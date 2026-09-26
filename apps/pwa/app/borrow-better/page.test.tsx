import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const { ensureAnonymousSessionMock, trackEventMock, track11aEnabledMock, track11bEnabledMock, searchParamsMock } = vi.hoisted(() => ({
  ensureAnonymousSessionMock: vi.fn(),
  trackEventMock: vi.fn(),
  track11aEnabledMock: vi.fn(() => false),
  track11bEnabledMock: vi.fn(() => false),
  searchParamsMock: new URLSearchParams(),
}));

vi.mock("../../lib/api", () => ({
  ensureAnonymousSession: ensureAnonymousSessionMock,
  requireApiBaseUrl: () => "http://127.0.0.1:8010",
  trackEvent: trackEventMock,
}));

vi.mock("../../lib/journeySession", async () => {
  const actual = await vi.importActual<typeof import("../../lib/journeySession")>("../../lib/journeySession");
  return { ...actual, track11aEnabled: track11aEnabledMock, track11bEnabled: track11bEnabledMock };
});

vi.mock("next/navigation", () => ({
  useSearchParams: () => searchParamsMock,
}));

import BorrowBetterPage from "./page";

const LEGACY_HEADING = "Know what feels comfortable before you borrow.";
const NEW_HEADING = "Borrowing decisions begin with your situation.";

function setFlags(a: boolean, b: boolean) {
  track11aEnabledMock.mockReturnValue(a);
  track11bEnabledMock.mockReturnValue(b);
}

beforeEach(() => {
  ensureAnonymousSessionMock.mockReset();
  ensureAnonymousSessionMock.mockResolvedValue(undefined);
  trackEventMock.mockReset();
  window.sessionStorage.clear();
  window.history.replaceState(null, "", "/");
  for (const key of Array.from(searchParamsMock.keys())) searchParamsMock.delete(key);
});

afterEach(() => cleanup());

describe("Borrow Better route flag gate", () => {
  it("track11a=false, track11b=false: the existing Track 1.0 journey", () => {
    setFlags(false, false);
    render(<BorrowBetterPage />);
    expect(screen.getByRole("heading", { name: LEGACY_HEADING })).toBeInTheDocument();
    expect(screen.getByLabelText("Existing monthly commitments")).toBeInTheDocument();
    expect(screen.queryByRole("heading", { name: NEW_HEADING })).toBeNull();
    // Track 1.0 emits no 1.1A screen events.
    expect(trackEventMock.mock.calls.filter(([, , details]) => details?.screenName)).toHaveLength(0);
  });

  it("track11a=false, track11b=true: fails safe to Track 1.0, exposing nothing new", () => {
    setFlags(false, true);
    render(<BorrowBetterPage />);
    expect(screen.getByRole("heading", { name: LEGACY_HEADING })).toBeInTheDocument();
    expect(screen.queryByRole("heading", { name: NEW_HEADING })).toBeNull();
    expect(screen.queryByText(/pilot/i)).toBeNull();
  });

  it("track11a=true, track11b=false: the redesigned situations landing", async () => {
    setFlags(true, false);
    render(<BorrowBetterPage />);
    expect(await screen.findByRole("heading", { name: NEW_HEADING })).toBeInTheDocument();
    expect(screen.queryByRole("heading", { name: LEGACY_HEADING })).toBeNull();
    expect(screen.queryByLabelText("Existing monthly commitments")).toBeNull();
    for (const nav of ["Rising EMIs", "New purchase", "Loan offer", "Rejected or shortfall"]) {
      expect(screen.getByText(new RegExp(nav))).toBeInTheDocument();
    }
  });

  it("track11a=true, track11b=true: still the redesigned landing, with no Step 6 and no legacy continuation", async () => {
    setFlags(true, true);
    render(<BorrowBetterPage />);
    expect(await screen.findByRole("heading", { name: NEW_HEADING })).toBeInTheDocument();
    expect(screen.queryByRole("heading", { name: LEGACY_HEADING })).toBeNull();
    expect(screen.queryByText(/pilot|\bOTP\b|See what I could check next/i)).toBeNull();
    // The redesigned landing legitimately says "Explore without a mobile number" — the forbidden thing is
    // a field that collects one, not the phrase itself.
    expect(screen.queryByLabelText(/mobile number/i)).toBeNull();
    expect(screen.queryByRole("textbox", { name: /mobile/i })).toBeNull();
  });

  it("a campaign URL opens its matching situation directly, without a chooser step", async () => {
    setFlags(true, false);
    searchParamsMock.set("situation", "offer");
    render(<BorrowBetterPage />);
    expect(await screen.findByRole("heading", { name: "What does this offer really cost?" })).toBeInTheDocument();
    expect(screen.queryByRole("heading", { name: NEW_HEADING })).toBeNull();
  });

  it("a campaign URL naming a Rewards situation does not open it under the Borrow Better header", async () => {
    setFlags(true, false);
    // "fee" (Annual fee) belongs to the rewards group, not this borrow group.
    searchParamsMock.set("situation", "fee");
    render(<BorrowBetterPage />);
    expect(await screen.findByRole("heading", { name: NEW_HEADING })).toBeInTheDocument();
    expect(screen.queryByRole("heading", { name: "Did your redeemed rewards cover the fee?" })).toBeNull();
  });
});
