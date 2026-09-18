import { beforeEach, describe, expect, it } from "vitest";
import { getAttributionTouches, syncAttributionTouches } from "./attribution";

describe("attribution touches", () => {
  beforeEach(() => {
    window.sessionStorage.clear();
    window.history.replaceState({}, "", "/money-value");
    Object.defineProperty(document, "referrer", {
      configurable: true,
      value: "",
    });
  });

  it("captures allow-listed UTM fields on first visit", () => {
    window.history.replaceState({}, "", "/money-value?utm_source=google&utm_medium=cpc&utm_campaign=alpha&utm_content=hero&utm_term=rewards&foo=dropme");
    Object.defineProperty(document, "referrer", {
      configurable: true,
      value: "https://example.com/source/path?secret=1",
    });

    const snapshot = syncAttributionTouches();

    expect(snapshot.firstTouch).toEqual({
      utm_source: "google",
      utm_medium: "cpc",
      utm_campaign: "alpha",
      utm_content: "hero",
      utm_term: "rewards",
      landing_path: "/money-value",
      referrer: "https://example.com/source/path",
    });
    expect((snapshot.firstTouch as Record<string, unknown>).foo).toBeUndefined();
    expect(snapshot.latestTouch).toEqual(snapshot.firstTouch);
  });

  it("preserves first touch and updates latest touch on new attributed landing", () => {
    window.history.replaceState({}, "", "/money-value?utm_source=google&utm_medium=cpc&utm_campaign=alpha");
    syncAttributionTouches();

    window.history.replaceState({}, "", "/borrow-better?utm_source=newsletter&utm_medium=email&utm_campaign=beta&utm_content=footer");
    const updated = syncAttributionTouches();

    expect(updated.firstTouch?.utm_source).toBe("google");
    expect(updated.firstTouch?.utm_campaign).toBe("alpha");
    expect(updated.latestTouch?.utm_source).toBe("newsletter");
    expect(updated.latestTouch?.utm_campaign).toBe("beta");
    expect(updated.latestTouch?.landing_path).toBe("/borrow-better");
  });

  it("does not overwrite latest touch when no new attribution is present", () => {
    window.history.replaceState({}, "", "/money-value?utm_source=google&utm_medium=cpc&utm_campaign=alpha");
    syncAttributionTouches();

    window.history.replaceState({}, "", "/money-value");
    const unchanged = syncAttributionTouches();

    expect(unchanged.firstTouch?.utm_source).toBe("google");
    expect(unchanged.latestTouch?.utm_source).toBe("google");
  });

  it("reads stored touches for later events in same session", () => {
    window.history.replaceState({}, "", "/money-value?utm_source=google&utm_medium=cpc&utm_campaign=alpha");
    syncAttributionTouches();

    const snapshot = getAttributionTouches();
    expect(snapshot.firstTouch?.utm_source).toBe("google");
    expect(snapshot.latestTouch?.utm_campaign).toBe("alpha");
  });
});
