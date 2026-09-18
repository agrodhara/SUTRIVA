import { beforeEach, describe, expect, it } from "vitest";
import { getMoneyCardCheckNumber, incrementMoneyCardCheckNumber } from "./journeySession";

describe("money card check numbering", () => {
  beforeEach(() => {
    window.sessionStorage.clear();
  });

  it("starts at 1 for the first rewards card check in a session", () => {
    expect(getMoneyCardCheckNumber()).toBe(1);
  });

  it("increments on check another card within the same session", () => {
    expect(getMoneyCardCheckNumber()).toBe(1);
    expect(incrementMoneyCardCheckNumber()).toBe(2);
    expect(getMoneyCardCheckNumber()).toBe(2);
    expect(incrementMoneyCardCheckNumber()).toBe(3);
    expect(getMoneyCardCheckNumber()).toBe(3);
  });
});
