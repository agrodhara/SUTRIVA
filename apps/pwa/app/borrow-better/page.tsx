"use client";

import { Suspense } from "react";
import { track11aEnabled } from "../../lib/journeySession";
import { SituationsApp } from "../situations/SituationsApp";
import LegacyBorrowBetterPage from "./LegacyBorrowBetterPage";

/**
 * Flag gate for the Borrow Better route.
 *
 * - `track11aEnabled=false`: the existing Track 1.0 journey, unchanged.
 * - `track11aEnabled=true`: the redesigned 1.1A situations experience (rising EMIs, new purchase, loan
 *   offer, rejected/offered less) — see ../situations/SituationsApp.tsx. It supersedes the previous single
 *   Steps 2-5 journey, which is removed rather than left running alongside a route nothing links to.
 *
 * Only `track11aEnabled` is read here, so any `track11bEnabled` value resolves to one of these two paths;
 * the situations app never reads or exposes the 1.1B pilot flag itself.
 */
export default function BorrowBetterPage() {
  if (!track11aEnabled()) return <LegacyBorrowBetterPage />;
  return (
    <Suspense fallback={null}>
      <SituationsApp group="borrow" />
    </Suspense>
  );
}
