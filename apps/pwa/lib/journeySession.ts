import { TRACK11_VERSION, TRACK11A_ENABLED, TRACK11B_ENABLED } from "./track11Config";

export type Journey = "money_value" | "comfortable_borrowing";

const MONEY_CARD_CHECK_NUMBER_KEY = "track11:money-card-check-number";
const EVENT_ONCE_KEY_PREFIX = "track11:event-once:";

let fallbackMoneyCardCheckNumber = 1;
const fallbackEventKeys = new Set<string>();

function randomId(): string {
  if (typeof crypto !== "undefined" && typeof crypto.randomUUID === "function") {
    return crypto.randomUUID();
  }
  return `${Date.now()}-${Math.random().toString(16).slice(2)}`;
}

export function createJourneyRunId(): string {
  return randomId();
}

export function createEventId(): string {
  return randomId();
}

export function getMoneyCardCheckNumber(): number {
  if (typeof window === "undefined") return fallbackMoneyCardCheckNumber;

  try {
    const raw = window.sessionStorage.getItem(MONEY_CARD_CHECK_NUMBER_KEY);
    const parsed = raw ? Number.parseInt(raw, 10) : Number.NaN;
    if (Number.isInteger(parsed) && parsed >= 1) return parsed;
    window.sessionStorage.setItem(MONEY_CARD_CHECK_NUMBER_KEY, "1");
    return 1;
  } catch {
    return fallbackMoneyCardCheckNumber;
  }
}

export function incrementMoneyCardCheckNumber(): number {
  if (typeof window === "undefined") {
    fallbackMoneyCardCheckNumber += 1;
    return fallbackMoneyCardCheckNumber;
  }

  try {
    const next = getMoneyCardCheckNumber() + 1;
    window.sessionStorage.setItem(MONEY_CARD_CHECK_NUMBER_KEY, String(next));
    return next;
  } catch {
    fallbackMoneyCardCheckNumber += 1;
    return fallbackMoneyCardCheckNumber;
  }
}

export function shouldEmitEventOnce(key: string): boolean {
  if (typeof window === "undefined") {
    if (fallbackEventKeys.has(key)) return false;
    fallbackEventKeys.add(key);
    return true;
  }

  try {
    const storageKey = `${EVENT_ONCE_KEY_PREFIX}${key}`;
    if (window.sessionStorage.getItem(storageKey) === "1") return false;
    window.sessionStorage.setItem(storageKey, "1");
    return true;
  } catch {
    if (fallbackEventKeys.has(key)) return false;
    fallbackEventKeys.add(key);
    return true;
  }
}

export function eventTimestamp(): string {
  return new Date().toISOString();
}

export function track11aEnabled(): boolean {
  return TRACK11A_ENABLED;
}

export function track11bEnabled(): boolean {
  return TRACK11B_ENABLED;
}

export function track11Version(): string {
  return TRACK11_VERSION;
}