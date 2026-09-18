import { beforeEach, describe, expect, it, vi } from "vitest";

describe("trackEvent attribution and identifiers", () => {
  beforeEach(() => {
    vi.resetModules();
    window.sessionStorage.clear();
    window.history.replaceState({}, "", "/money-value");
    Object.defineProperty(document, "referrer", {
      configurable: true,
      value: "",
    });
    process.env.NEXT_PUBLIC_API_BASE_URL = "http://127.0.0.1:8010";
    global.fetch = vi.fn().mockResolvedValue({ ok: true }) as unknown as typeof fetch;
  });

  it("sends allow-listed attribution only and includes card_check_number for money journey", async () => {
    window.history.replaceState({}, "", "/money-value?utm_source=google&utm_medium=cpc&utm_campaign=alpha&utm_content=hero&utm_term=rewards&foo=drop");
    Object.defineProperty(document, "referrer", {
      configurable: true,
      value: "https://ref.example/path?secret=drop",
    });

    const { trackEvent } = await import("./api");
    trackEvent("journey_started", "money_value", { journeyRunId: "run-1", cardCheckNumber: 1 });

    expect(global.fetch).toHaveBeenCalledTimes(1);
    const [, init] = vi.mocked(global.fetch).mock.calls[0];
    const body = JSON.parse((init as RequestInit).body as string);

    expect(body.card_check_number).toBe(1);
    expect(body.first_touch_attribution).toEqual({
      utm_source: "google",
      utm_medium: "cpc",
      utm_campaign: "alpha",
      utm_content: "hero",
      utm_term: "rewards",
      landing_path: "/money-value",
      referrer: "https://ref.example/path",
    });
    expect(body.latest_touch_attribution).toEqual(body.first_touch_attribution);
    expect(body.first_touch_attribution.foo).toBeUndefined();
  });

  it("does not attach card_check_number to borrow journey events", async () => {
    const { trackEvent } = await import("./api");
    trackEvent("journey_started", "comfortable_borrowing", { journeyRunId: "run-borrow" });

    expect(global.fetch).toHaveBeenCalledTimes(1);
    const [, init] = vi.mocked(global.fetch).mock.calls[0];
    const body = JSON.parse((init as RequestInit).body as string);

    expect(body.card_check_number).toBeUndefined();
  });
});
