import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const { ensureAnonymousSessionMock, trackEventMock, track11aEnabledMock, track11bEnabledMock } = vi.hoisted(() => ({
  ensureAnonymousSessionMock: vi.fn(),
  trackEventMock: vi.fn(),
  track11aEnabledMock: vi.fn(() => false),
  track11bEnabledMock: vi.fn(() => false),
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

import BorrowBetterPage from "./page";

const LEGACY_HEADING = "Know what feels comfortable before you borrow.";

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
});

afterEach(() => cleanup());

describe("Borrow Better route flag gate", () => {
  it("track11a=false, track11b=false: the existing Track 1.0 journey", () => {
    setFlags(false, false);
    render(<BorrowBetterPage />);
    expect(screen.getByRole("heading", { name: LEGACY_HEADING })).toBeInTheDocument();
    expect(screen.getByLabelText("Existing monthly commitments")).toBeInTheDocument();
    expect(screen.queryByRole("heading", { name: "Your monthly position" })).toBeNull();
    // Track 1.0 emits no 1.1A screen events.
    expect(trackEventMock.mock.calls.filter(([, , details]) => details?.screenName)).toHaveLength(0);
  });

  it("track11a=false, track11b=true: fails safe to Track 1.0, exposing nothing new", () => {
    setFlags(false, true);
    render(<BorrowBetterPage />);
    expect(screen.getByRole("heading", { name: LEGACY_HEADING })).toBeInTheDocument();
    expect(screen.queryByRole("heading", { name: "Your monthly position" })).toBeNull();
    expect(screen.queryByText(/pilot/i)).toBeNull();
  });

  it("track11a=true, track11b=false: the final Steps 2-5 journey", () => {
    setFlags(true, false);
    render(<BorrowBetterPage />);
    expect(screen.getByRole("heading", { name: "Your monthly position" })).toBeInTheDocument();
    expect(screen.queryByRole("heading", { name: LEGACY_HEADING })).toBeNull();
    expect(screen.queryByLabelText("Existing monthly commitments")).toBeNull();
  });

  it("track11a=true, track11b=true: still the final journey, with no Step 6 and no legacy continuation", () => {
    setFlags(true, true);
    render(<BorrowBetterPage />);
    expect(screen.getByRole("heading", { name: "Your monthly position" })).toBeInTheDocument();
    expect(screen.queryByRole("heading", { name: LEGACY_HEADING })).toBeNull();
    expect(screen.queryByText(/pilot|OTP|mobile number|See what I could check next/i)).toBeNull();
  });
});
