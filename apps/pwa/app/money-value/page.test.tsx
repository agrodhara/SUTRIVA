import { cleanup, render, screen, waitFor } from "@testing-library/react";
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

async function renderPage() {
  const pageModule = await import("./page");
  render(<pageModule.default />);
}

const FLAG_COMBINATIONS: Array<[boolean, boolean]> = [
  [false, false],
  [false, true],
  [true, false],
  [true, true],
];

describe("Money Value page flag dispatch", () => {
  beforeEach(() => {
    ensureAnonymousSessionMock.mockReset();
    ensureAnonymousSessionMock.mockResolvedValue(undefined);
    trackEventMock.mockReset();
    track11aEnabledMock.mockReset();
    track11bEnabledMock.mockReset();
    window.sessionStorage.clear();
    for (const key of Array.from(searchParamsMock.keys())) searchParamsMock.delete(key);
  });

  afterEach(() => {
    cleanup();
    vi.restoreAllMocks();
  });

  it.each(FLAG_COMBINATIONS.filter(([a]) => !a))("renders the unchanged Track 1.0 journey when track11aEnabled=false (b=%s)", async (_a, b) => {
    track11aEnabledMock.mockReturnValue(false);
    track11bEnabledMock.mockReturnValue(b);

    await renderPage();

    await waitFor(() => expect(screen.getByRole("button", { name: "Check my money value" })).toBeEnabled());
    expect(screen.getByRole("heading", { name: "See what your card use is worth." })).toBeInTheDocument();
    expect(screen.queryByRole("heading", { name: "Is your card giving you value where it matters?" })).not.toBeInTheDocument();
  });

  it.each(FLAG_COMBINATIONS.filter(([a]) => a))("renders the redesigned Rewards Intelligence landing when track11aEnabled=true (b=%s)", async (_a, b) => {
    track11aEnabledMock.mockReturnValue(true);
    track11bEnabledMock.mockReturnValue(b);

    await renderPage();

    expect(await screen.findByRole("heading", { name: "Is your card giving you value where it matters?" })).toBeInTheDocument();
    // The legacy single-page form is not reachable from the new path.
    expect(screen.queryByRole("button", { name: "Check my money value" })).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Open reward finder" })).not.toBeInTheDocument();
    // All five situations are reachable from the landing choice grid.
    for (const nav of ["Annual fee", "Card and spending fit", "Carrying a balance", "Several cards", "Unused points"]) {
      expect(screen.getByText(new RegExp(nav))).toBeInTheDocument();
    }
  });

  it("does not expose Step 6 or any pilot control in any flag combination", async () => {
    for (const [a, b] of FLAG_COMBINATIONS) {
      track11aEnabledMock.mockReturnValue(a);
      track11bEnabledMock.mockReturnValue(b);
      await renderPage();
      await waitFor(() => expect(document.querySelector("main")).not.toBeNull());

      expect(screen.queryByText(/join the pilot/i)).not.toBeInTheDocument();
      // The redesigned landing legitimately says "Explore without a mobile number" — the forbidden thing
      // is a field that collects one, not the phrase itself.
      expect(screen.queryByLabelText(/mobile number/i)).not.toBeInTheDocument();
      expect(screen.queryByRole("textbox", { name: /mobile/i })).not.toBeInTheDocument();
      expect(screen.queryByText(/\bOTP\b/)).not.toBeInTheDocument();
      expect(screen.queryByRole("checkbox", { name: /updates/i })).not.toBeInTheDocument();
      cleanup();
    }
  });

  it("a campaign URL opens its matching situation directly, without a chooser step", async () => {
    track11aEnabledMock.mockReturnValue(true);
    track11bEnabledMock.mockReturnValue(false);
    searchParamsMock.set("situation", "fee");

    await renderPage();

    expect(await screen.findByRole("heading", { name: "Did your redeemed rewards cover the fee?" })).toBeInTheDocument();
    expect(screen.queryByRole("heading", { name: "Is your card giving you value where it matters?" })).not.toBeInTheDocument();
  });

  it("a campaign URL naming a Borrow situation does not open it under the Rewards Intelligence header", async () => {
    track11aEnabledMock.mockReturnValue(true);
    track11bEnabledMock.mockReturnValue(false);
    // "offer" (Loan offer) belongs to the borrow group, not this rewards group.
    searchParamsMock.set("situation", "offer");

    await renderPage();

    expect(await screen.findByRole("heading", { name: "Is your card giving you value where it matters?" })).toBeInTheDocument();
    expect(screen.queryByRole("heading", { name: "What does this offer really cost?" })).not.toBeInTheDocument();
  });

  it("emits no legacy continuation or consent events from the new path", async () => {
    track11aEnabledMock.mockReturnValue(true);
    track11bEnabledMock.mockReturnValue(true);

    await renderPage();
    await screen.findByRole("heading", { name: "Is your card giving you value where it matters?" });

    const emitted = trackEventMock.mock.calls.map(([eventType]) => eventType);
    for (const legacy of [
      "journey_started",
      "teaser_viewed",
      "teaser_cta_selected",
      "next_interest_viewed",
      "next_interest_selected",
      "go_deeper_selected",
      "pilot_cta_selected",
      "mobile_entry_started",
      "otp_requested",
      "pilot_consent_recorded",
      "marketing_consent_recorded",
    ]) {
      expect(emitted).not.toContain(legacy);
    }
  });
});
