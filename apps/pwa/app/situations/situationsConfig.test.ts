import { describe, expect, it } from "vitest";
import { GROUPS, isSituationKey, isSituationKeyInGroup, type SituationGroup } from "./situationsConfig";

describe("isSituationKeyInGroup", () => {
  it("accepts every key for its own, correct group", () => {
    for (const group of Object.keys(GROUPS) as SituationGroup[]) {
      for (const key of GROUPS[group]) {
        expect(isSituationKeyInGroup(key, group)).toBe(true);
      }
    }
  });

  it("rejects every key for the other group — both directions", () => {
    // Every borrow key must be rejected under the rewards group, and vice versa. This is the exact bug a
    // campaign URL could otherwise trigger: /money-value?situation=offer opening Loan offer (a borrow
    // situation) under the Rewards Intelligence header, or the reverse.
    for (const key of GROUPS.borrow) {
      expect(isSituationKeyInGroup(key, "rewards")).toBe(false);
    }
    for (const key of GROUPS.rewards) {
      expect(isSituationKeyInGroup(key, "borrow")).toBe(false);
    }
  });

  it("rejects null and an unknown key for either group", () => {
    expect(isSituationKeyInGroup(null, "borrow")).toBe(false);
    expect(isSituationKeyInGroup(null, "rewards")).toBe(false);
    expect(isSituationKeyInGroup("not-a-real-situation", "borrow")).toBe(false);
    expect(isSituationKeyInGroup("not-a-real-situation", "rewards")).toBe(false);
  });

  it("is at least as strict as isSituationKey (never accepts what isSituationKey itself rejects)", () => {
    const candidates: (string | null)[] = [null, "", "offer", "fee", "bogus", "OFFER"];
    for (const candidate of candidates) {
      for (const group of ["borrow", "rewards"] as SituationGroup[]) {
        if (isSituationKeyInGroup(candidate, group)) {
          expect(isSituationKey(candidate)).toBe(true);
        }
      }
    }
  });
});
