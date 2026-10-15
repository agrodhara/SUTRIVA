import { cleanup, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, expect, it, vi } from "vitest";

vi.mock("../../lib/api", () => ({
  requireApiBaseUrl: () => "http://127.0.0.1:8010",
}));

import SavedCheckPage from "./page";

const SAVED_CHECK = {
  situation_key: "offer" as const,
  input_values: { principal: 500000, emi: 12000, months: 48, income: 60000, costs: 20000 },
  provenance: "own" as const,
  result_title: "Loan offer check",
  result_headline: "This looks manageable",
  result_detail: "detail",
  result_insight: "insight",
  result_scenario: "scenario",
  result_note: "note",
  result_bars: [{ label: "EMI share", value: 20, tone: "positive" }],
  created_at: "2026-10-01T00:00:00Z",
};

beforeEach(() => {
  // The token lives in the URL *fragment*, never sent to any server — see page.tsx's own docstring and
  // docs/execution/B1_SAVED_CHECK_LAUNCH_GAPS.md. Setting it directly here is the jsdom equivalent of a
  // visitor following the emailed `/saved#<token>` link.
  window.location.hash = "test-token";
});

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
  window.location.hash = "";
});

it("reads the token from the URL fragment, not a path or query parameter, and requests it as a header", async () => {
  // A plain `let ... = null` reassigned only inside the vi.fn() callback below hits a real TypeScript
  // narrowing quirk (reproduced in isolation, unrelated to Headers/RequestInit specifically — a trivial
  // `let x: T | null = null` reassigned inside *any* callback and read via `x?.foo` afterward narrows to
  // `never` under this project's tsconfig, caught by CI's dedicated `tsc --noEmit` step, which `next
  // build`'s own type-check didn't catch). A mutable ref object sidesteps it cleanly.
  const requestHeadersRef: { current: Headers | null } = { current: null };
  global.fetch = vi.fn((url: string, init?: RequestInit) => {
    requestHeadersRef.current = init?.headers ? new Headers(init.headers) : null;
    // The fetch target itself must never contain the token — confirms it never becomes a path/query value.
    expect(String(url)).not.toContain("test-token");
    return Promise.resolve({ ok: true, status: 200, json: async () => SAVED_CHECK });
  }) as unknown as typeof fetch;

  render(<SavedCheckPage />);

  await screen.findByText("This looks manageable");
  expect(requestHeadersRef.current?.get("X-Saved-Check-Token")).toBe("test-token");
});

it("renders the saved result once loaded", async () => {
  global.fetch = vi.fn().mockResolvedValue({ ok: true, status: 200, json: async () => SAVED_CHECK }) as unknown as typeof fetch;

  render(<SavedCheckPage />);

  expect(await screen.findByText("This looks manageable")).toBeInTheDocument();
  // "Loan offer check" (the result title) appears three times by design, matching the live result
  // screen's own layout exactly: the dark summary panel, the side chart's heading, and ValueBars' own
  // visually-hidden figcaption.
  expect(screen.getAllByText("Loan offer check")).toHaveLength(3);
  expect(screen.getByText("insight")).toBeInTheDocument();
  expect(screen.getByRole("button", { name: "Delete this saved check" })).toBeInTheDocument();
});

it("shows a single 'no longer valid' state for a 404 (wrong, expired, or already-deleted token alike)", async () => {
  global.fetch = vi.fn().mockResolvedValue({ ok: false, status: 404, json: async () => ({ detail: "not_found" }) }) as unknown as typeof fetch;

  render(<SavedCheckPage />);

  expect(await screen.findByText("This link is no longer valid")).toBeInTheDocument();
});

it("shows the same 'no longer valid' state with no fragment at all, rather than an error or a blank page", async () => {
  window.location.hash = "";
  global.fetch = vi.fn() as unknown as typeof fetch;

  render(<SavedCheckPage />);

  expect(await screen.findByText("This link is no longer valid")).toBeInTheDocument();
  expect(global.fetch).not.toHaveBeenCalled();
});

it("deleting the saved check sends the token as a header, shows a deleted confirmation, and the result is no longer shown", async () => {
  // See the identical note on the retrieval test above — a ref object, not a plain `let`, sidesteps a
  // real TypeScript narrowing quirk caught by CI's `tsc --noEmit` step.
  const deleteHeadersRef: { current: Headers | null } = { current: null };
  global.fetch = vi.fn((url: string, init?: RequestInit) => {
    if (init?.method === "DELETE") {
      deleteHeadersRef.current = init?.headers ? new Headers(init.headers) : null;
      expect(String(url)).not.toContain("test-token");
      return Promise.resolve({ ok: true, status: 200, json: async () => ({ status: "deleted" }) });
    }
    return Promise.resolve({ ok: true, status: 200, json: async () => SAVED_CHECK });
  }) as unknown as typeof fetch;

  const user = userEvent.setup();
  render(<SavedCheckPage />);

  await screen.findByText("This looks manageable");
  await user.click(screen.getByRole("button", { name: "Delete this saved check" }));

  expect(await screen.findByText("Saved check deleted")).toBeInTheDocument();
  expect(screen.queryByText("This looks manageable")).not.toBeInTheDocument();
  expect(deleteHeadersRef.current?.get("X-Saved-Check-Token")).toBe("test-token");
});

it("a failed delete shows an error and keeps the result visible, not a false deleted state", async () => {
  global.fetch = vi.fn((url: string, init?: RequestInit) => {
    if (init?.method === "DELETE") {
      return Promise.resolve({ ok: false, status: 503, json: async () => ({ detail: "service_unavailable" }) });
    }
    return Promise.resolve({ ok: true, status: 200, json: async () => SAVED_CHECK });
  }) as unknown as typeof fetch;

  const user = userEvent.setup();
  render(<SavedCheckPage />);

  await screen.findByText("This looks manageable");
  await user.click(screen.getByRole("button", { name: "Delete this saved check" }));

  expect(await screen.findByRole("alert")).toHaveTextContent("Something went wrong. Please try again.");
  expect(screen.getByText("This looks manageable")).toBeInTheDocument();
});
