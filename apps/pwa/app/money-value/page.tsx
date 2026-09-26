"use client";

import { Suspense } from "react";
import { track11aEnabled } from "../../lib/journeySession";
import { SituationsApp } from "../situations/SituationsApp";
import LegacyMoneyValuePage from "./LegacyMoneyValuePage";

/**
 * Flag gate for the Rewards Intelligence route.
 *
 * - `track11aEnabled=false`: the existing Track 1.0 Money Value journey, unchanged.
 * - `track11aEnabled=true`: the redesigned 1.1A situations experience (annual fee, card fit, carrying a
 *   balance, several cards, unused points) — see ../situations/SituationsApp.tsx. It supersedes the
 *   previous single Steps 2-5 journey, which is removed rather than left running alongside a route nothing
 *   links to.
 *
 * `track11bEnabled` is deliberately not read here. Step 6 (1.1B) is not implemented in this route, so no
 * flag combination can expose it, and the legacy Reveal/Intent/Closure flow stays unreachable.
 */
export default function MoneyValuePage() {
  if (!track11aEnabled()) return <LegacyMoneyValuePage />;
  return (
    <Suspense fallback={null}>
      <SituationsApp group="rewards" />
    </Suspense>
  );
}
