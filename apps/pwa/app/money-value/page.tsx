"use client";

import { track11aEnabled } from "../../lib/journeySession";
import LegacyMoneyValuePage from "./LegacyMoneyValuePage";
import { RewardsJourney } from "./RewardsJourney";

/**
 * Flag dispatch only.
 * - track11aEnabled=false: the existing Track 1.0 Money Value journey, unchanged.
 * - track11aEnabled=true: the final Rewards 1.1A Steps 2-5 journey.
 * track11bEnabled is deliberately not read here. Step 6 (1.1B) is not implemented, so no flag
 * combination can expose it, and the legacy Reveal/Intent/Closure flow is unreachable from the new path.
 */
export default function MoneyValuePage() {
  return track11aEnabled() ? <RewardsJourney /> : <LegacyMoneyValuePage />;
}
