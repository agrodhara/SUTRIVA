import { cleanup, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, expect, it, vi } from "vitest";

vi.mock("../../../lib/api", () => ({
  requireApiBaseUrl: () => "http://127.0.0.1:8010",
}));

vi.mock("next/navigation", () => ({
  useParams: () => ({ token: "test-token" }),
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

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
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

it("deleting the saved check shows a deleted confirmation and the result is no longer shown", async () => {
  global.fetch = vi.fn((url: string, init?: RequestInit) => {
    if (init?.method === "DELETE") {
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
