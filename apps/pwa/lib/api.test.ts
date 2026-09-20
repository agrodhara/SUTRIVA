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

    await vi.waitFor(() => expect(global.fetch).toHaveBeenCalledTimes(2));
    expect(vi.mocked(global.fetch).mock.calls[0]?.[0]).toBe("http://127.0.0.1:8010/v1/anonymous-sessions/bootstrap");
    const [, init] = vi.mocked(global.fetch).mock.calls[1];
    const body = JSON.parse((init as RequestInit).body as string);

    expect((init as RequestInit).credentials).toBe("include");
    expect(body.card_check_number).toBe(1);
    expect(body.anonymous_session_id).toBeUndefined();
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

    await vi.waitFor(() => expect(global.fetch).toHaveBeenCalledTimes(2));
    const [, init] = vi.mocked(global.fetch).mock.calls[1];
    const body = JSON.parse((init as RequestInit).body as string);

    expect(body.card_check_number).toBeUndefined();
  });

  it("retries once after a 401 by bootstrapping again", async () => {
    vi.mocked(global.fetch)
      .mockResolvedValueOnce({ ok: true } as unknown as Response)
      .mockResolvedValueOnce({ ok: false, status: 401 } as unknown as Response)
      .mockResolvedValueOnce({ ok: true } as unknown as Response)
      .mockResolvedValueOnce({ ok: true, status: 200 } as unknown as Response);

    const { trackEvent } = await import("./api");
    trackEvent("journey_started", "money_value", { journeyRunId: "run-1", cardCheckNumber: 1 });

    await vi.waitFor(() => expect(global.fetch).toHaveBeenCalledTimes(4));
    expect(vi.mocked(global.fetch).mock.calls[2]?.[0]).toBe("http://127.0.0.1:8010/v1/anonymous-sessions/bootstrap");
  });
});

describe("trackEvent screen_name (1.1A journey foundation)", () => {
  beforeEach(() => {
    vi.resetModules();
    window.sessionStorage.clear();
    window.history.replaceState({}, "", "/money-value");
    process.env.NEXT_PUBLIC_API_BASE_URL = "http://127.0.0.1:8010";
    global.fetch = vi.fn().mockResolvedValue({ ok: true }) as unknown as typeof fetch;
  });

  async function sentBody() {
    await vi.waitFor(() => expect(global.fetch).toHaveBeenCalledTimes(2));
    const [, init] = vi.mocked(global.fetch).mock.calls[1];
    return JSON.parse((init as RequestInit).body as string);
  }

  it("sends screen_name for the new final-journey event types", async () => {
    const { trackEvent } = await import("./api");
    trackEvent("result_declared", "comfortable_borrowing", { journeyRunId: "run-b", screenName: "borrow_check" });

    const body = await sentBody();
    expect(body.event_type).toBe("result_declared");
    expect(body.screen_name).toBe("borrow_check");
  });

  it("omits screen_name for legacy callers", async () => {
    const { trackEvent } = await import("./api");
    trackEvent("step_viewed", "money_value", { journeyRunId: "run-m", cardCheckNumber: 1 });

    const body = await sentBody();
    expect("screen_name" in body).toBe(false);
  });
});
