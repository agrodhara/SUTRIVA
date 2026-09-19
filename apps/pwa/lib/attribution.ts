export type AttributionPayload = {
  utm_source?: string;
  utm_medium?: string;
  utm_campaign?: string;
  utm_content?: string;
  utm_term?: string;
  landing_path: string;
  referrer?: string;
};

type AttributionSnapshot = {
  firstTouch: AttributionPayload | null;
  latestTouch: AttributionPayload | null;
};

const FIRST_TOUCH_KEY = "track11:attribution:first-touch";
const LATEST_TOUCH_KEY = "track11:attribution:latest-touch";

let fallbackFirstTouch: AttributionPayload | null = null;
let fallbackLatestTouch: AttributionPayload | null = null;

function sanitizeValue(value: string | null): string | undefined {
  if (!value) return undefined;
  const cleaned = value.trim().replace(/[^a-zA-Z0-9._ -]/g, "").slice(0, 120);
  return cleaned || undefined;
}

function sanitizeLandingPath(pathname: string): string {
  const cleaned = pathname.trim().replace(/[^a-zA-Z0-9/_-]/g, "");
  return cleaned || "/";
}

function sanitizeReferrer(raw: string): string | undefined {
  const safe = sanitizeValue(raw);
  if (!safe) return undefined;

  try {
    const parsed = new URL(raw);
    if (parsed.protocol !== "http:" && parsed.protocol !== "https:") return undefined;
    const value = `${parsed.origin}${parsed.pathname}`;
    return value.slice(0, 200);
  } catch {
    return undefined;
  }
}

function parseCurrentAttribution(): AttributionPayload | null {
  if (typeof window === "undefined") return null;

  const params = new URLSearchParams(window.location.search);
  const utmSource = sanitizeValue(params.get("utm_source"));
  const utmMedium = sanitizeValue(params.get("utm_medium"));
  const utmCampaign = sanitizeValue(params.get("utm_campaign"));
  const utmContent = sanitizeValue(params.get("utm_content"));
  const utmTerm = sanitizeValue(params.get("utm_term"));

  const hasUtm = Boolean(utmSource || utmMedium || utmCampaign || utmContent || utmTerm);
  if (!hasUtm) return null;

  return {
    utm_source: utmSource,
    utm_medium: utmMedium,
    utm_campaign: utmCampaign,
    utm_content: utmContent,
    utm_term: utmTerm,
    landing_path: sanitizeLandingPath(window.location.pathname),
    referrer: sanitizeReferrer(document.referrer),
  };
}

function stableStringify(payload: AttributionPayload | null): string {
  return payload ? JSON.stringify(payload) : "";
}

function readSnapshotFromStorage(): AttributionSnapshot {
  if (typeof window === "undefined") {
    return { firstTouch: fallbackFirstTouch, latestTouch: fallbackLatestTouch };
  }

  try {
    const firstRaw = window.sessionStorage.getItem(FIRST_TOUCH_KEY);
    const latestRaw = window.sessionStorage.getItem(LATEST_TOUCH_KEY);
    return {
      firstTouch: firstRaw ? (JSON.parse(firstRaw) as AttributionPayload) : null,
      latestTouch: latestRaw ? (JSON.parse(latestRaw) as AttributionPayload) : null,
    };
  } catch {
    return { firstTouch: fallbackFirstTouch, latestTouch: fallbackLatestTouch };
  }
}

function persistSnapshot(snapshot: AttributionSnapshot): void {
  if (typeof window === "undefined") {
    fallbackFirstTouch = snapshot.firstTouch;
    fallbackLatestTouch = snapshot.latestTouch;
    return;
  }

  try {
    if (snapshot.firstTouch) {
      window.sessionStorage.setItem(FIRST_TOUCH_KEY, JSON.stringify(snapshot.firstTouch));
    }
    if (snapshot.latestTouch) {
      window.sessionStorage.setItem(LATEST_TOUCH_KEY, JSON.stringify(snapshot.latestTouch));
    }
  } catch {
    fallbackFirstTouch = snapshot.firstTouch;
    fallbackLatestTouch = snapshot.latestTouch;
  }
}

export function syncAttributionTouches(): AttributionSnapshot {
  const current = parseCurrentAttribution();
  const snapshot = readSnapshotFromStorage();

  if (!current) return snapshot;

  const nextFirstTouch = snapshot.firstTouch ?? current;
  const nextLatestTouch = stableStringify(snapshot.latestTouch) === stableStringify(current)
    ? snapshot.latestTouch
    : current;

  const nextSnapshot = {
    firstTouch: nextFirstTouch,
    latestTouch: nextLatestTouch,
  };
  persistSnapshot(nextSnapshot);
  return nextSnapshot;
}

export function getAttributionTouches(): AttributionSnapshot {
  return readSnapshotFromStorage();
}
