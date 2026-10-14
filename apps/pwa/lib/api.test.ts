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

/** jsdom's Blob implementation in this test environment has neither .text() nor .arrayBuffer() — FileReader
 * is the one Blob-reading API it implements fully. */
function readBlobAsText(blob: Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result as string);
    reader.onerror = reject;
    reader.readAsText(blob);
  });
}

describe("trackEventOnNavigate (reliable delivery across an immediate navigation)", () => {
  beforeEach(() => {
    vi.resetModules();
    window.sessionStorage.clear();
    window.history.replaceState({}, "", "/");
    process.env.NEXT_PUBLIC_API_BASE_URL = "http://127.0.0.1:8010";
    global.fetch = vi.fn().mockResolvedValue({ ok: true }) as unknown as typeof fetch;
  });

  it("uses navigator.sendBeacon when available, and never calls fetch at all", async () => {
    const sendBeacon = vi.fn().mockReturnValue(true);
    vi.stubGlobal("navigator", { ...navigator, sendBeacon });

    const { trackEventOnNavigate } = await import("./api");
    trackEventOnNavigate("door_selected", "money_value");

    expect(sendBeacon).toHaveBeenCalledTimes(1);
    const [url, blob] = sendBeacon.mock.calls[0];
    expect(url).toBe("http://127.0.0.1:8010/v1/events");
    expect(blob).toBeInstanceOf(Blob);
    expect(blob.type).toBe("application/json");
    const body = JSON.parse(await readBlobAsText(blob));
    expect(body.event_type).toBe("door_selected");
    expect(body.journey).toBe("money_value");

    // Giving the event loop a tick: if it fell back to fetch too, this would catch it as a double-send.
    await new Promise((r) => setTimeout(r, 0));
    expect(global.fetch).not.toHaveBeenCalled();

    vi.unstubAllGlobals();
  });

  it("builds the identical body shape trackEvent would — same attribution handling, only the transport differs", async () => {
    window.history.replaceState({}, "", "/borrow-better?utm_source=ig&utm_medium=paid&utm_campaign=52517814153716");
    const sendBeacon = vi.fn().mockReturnValue(true);
    vi.stubGlobal("navigator", { ...navigator, sendBeacon });

    const { trackEventOnNavigate } = await import("./api");
    trackEventOnNavigate("door_selected", "comfortable_borrowing");

    const [, blob] = sendBeacon.mock.calls[0];
    const body = JSON.parse(await readBlobAsText(blob));
    expect(body.first_touch_attribution).toEqual({
      utm_source: "ig",
      utm_medium: "paid",
      utm_campaign: "52517814153716",
      landing_path: "/borrow-better",
    });
    expect(body.latest_touch_attribution).toEqual(body.first_touch_attribution);

    vi.unstubAllGlobals();
  });

  it("falls back to the ordinary fetch-based delivery when sendBeacon is unavailable", async () => {
    vi.stubGlobal("navigator", { ...navigator, sendBeacon: undefined });

    const { trackEventOnNavigate } = await import("./api");
    trackEventOnNavigate("door_selected", "money_value");

    await vi.waitFor(() => expect(global.fetch).toHaveBeenCalledTimes(2));
    expect(vi.mocked(global.fetch).mock.calls[0]?.[0]).toBe("http://127.0.0.1:8010/v1/anonymous-sessions/bootstrap");
    const [, init] = vi.mocked(global.fetch).mock.calls[1];
    const body = JSON.parse((init as RequestInit).body as string);
    expect(body.event_type).toBe("door_selected");

    vi.unstubAllGlobals();
  });

  it("falls back to fetch when the browser reports it could not queue the beacon", async () => {
    const sendBeacon = vi.fn().mockReturnValue(false);
    vi.stubGlobal("navigator", { ...navigator, sendBeacon });

    const { trackEventOnNavigate } = await import("./api");
    trackEventOnNavigate("door_selected", "money_value");

    expect(sendBeacon).toHaveBeenCalledTimes(1);
    await vi.waitFor(() => expect(global.fetch).toHaveBeenCalledTimes(2));

    vi.unstubAllGlobals();
  });

  it("queues the beacon synchronously, before the function returns — a reload or tab close in the very next tick cannot interrupt it, unlike the fetch fallback's awaited chain", async () => {
    const sendBeacon = vi.fn().mockReturnValue(true);
    vi.stubGlobal("navigator", { ...navigator, sendBeacon });

    const { trackEventOnNavigate } = await import("./api");
    // No `await` anywhere here on purpose: this asserts the call already happened by the time
    // trackEventOnNavigate itself returns, not merely "eventually" — exactly the property a one-tick
    // setTimeout-based check would not establish. Contrast with the fetch fallback path, which is a promise
    // chain (ensureAnonymousSession().then(...)) still pending when this line runs.
    trackEventOnNavigate("door_selected", "money_value");
    expect(sendBeacon).toHaveBeenCalledTimes(1);

    vi.unstubAllGlobals();
  });

  it("rapid repeated navigation attempts (e.g. a double-tap) each queue their own beacon independently — no dedup, no dropped send", async () => {
    const sendBeacon = vi.fn().mockReturnValue(true);
    vi.stubGlobal("navigator", { ...navigator, sendBeacon });

    const { trackEventOnNavigate } = await import("./api");
    trackEventOnNavigate("door_selected", "money_value");
    trackEventOnNavigate("door_selected", "money_value");
    trackEventOnNavigate("door_selected", "comfortable_borrowing");

    expect(sendBeacon).toHaveBeenCalledTimes(3);
    const bodies = await Promise.all(sendBeacon.mock.calls.map(([, blob]) => readBlobAsText(blob)));
    const journeys = bodies.map((b) => JSON.parse(b).journey);
    expect(journeys).toEqual(["money_value", "money_value", "comfortable_borrowing"]);

    vi.unstubAllGlobals();
  });
});
