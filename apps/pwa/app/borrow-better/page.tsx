"use client";

import { track11aEnabled } from "../../lib/journeySession";
import { BorrowJourney } from "./BorrowJourney";
import LegacyBorrowBetterPage from "./LegacyBorrowBetterPage";

/**
 * Flag gate for the Borrow Better route.
 *
 * - `track11aEnabled=false`: the existing Track 1.0 journey, unchanged.
 * - `track11aEnabled=true`: the final 1.1A Steps 2-5 journey. It never enters the legacy Reveal, Intent,
 *   Closure or terminal screens, and `track11bEnabled` does not expose anything beyond Step 5.
 *
 * Only `track11aEnabled` is read here, so any `track11bEnabled` value resolves to one of these two paths.
 */
export default function BorrowBetterPage() {
  return track11aEnabled() ? <BorrowJourney /> : <LegacyBorrowBetterPage />;
}
