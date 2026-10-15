"use client";

import { useEffect, useState } from "react";
import { ValueBars, type ValueBarRow } from "../../components/journey-ui/ValueBars";
import ui from "../../components/journey-ui/journeyUi.module.css";
import { ProvenanceBadge } from "../situations/ProvenanceBadge";
import { formatRupees } from "../situations/SituationFlow";
import { deleteSavedBorrowCheck, retrieveSavedBorrowCheck, SituationApiError, type SavedBorrowCheck } from "../situations/situationsApi";
import { SITUATIONS } from "../situations/situationsConfig";
import styles from "../situations/situations.module.css";

type LoadState = "loading" | "found" | "not_found" | "error";
type DeleteState = "idle" | "deleting" | "deleted";

/**
 * Milestone 2C retrieval page: `/saved#<token>` — a URL *fragment*, not a path segment (see
 * app/services/saved_borrow_checks.py). A fragment is never sent to any server in an HTTP request, so
 * this page's own URL never puts the token in the PWA's own server or any proxy's access log — unlike
 * the earlier `/saved/[token]` design this replaces, which did. The token is read client-side only, from
 * `window.location.hash`, and sent to the API as a header, never a path or query value — see
 * situationsApi.ts and docs/execution/B1_SAVED_CHECK_LAUNCH_GAPS.md for the full reasoning.
 *
 * Renders with the same result layout pieces the live result screen uses (ValueBars, ProvenanceBadge,
 * formatRupees), populated from the saved snapshot instead of a fresh calculation — nothing here is ever
 * recalculated.
 *
 * A wrong, expired, or already-deleted token gets one identical "no longer valid" state — the backend
 * deliberately returns the same 404 for all three (see retrieve_saved_borrow_check's docstring), so this
 * page cannot and does not distinguish them either.
 */
export default function SavedCheckPage() {
  const [token, setToken] = useState<string | null>(null);
  const [state, setState] = useState<LoadState>("loading");
  const [check, setCheck] = useState<SavedBorrowCheck | null>(null);
  const [deleteState, setDeleteState] = useState<DeleteState>("idle");
  const [deleteError, setDeleteError] = useState<string | null>(null);

  useEffect(() => {
    // Read once, client-side only — there is nothing to read during server rendering, and the fragment is
    // never part of what a server ever sees in the first place. `token` starts `null`, meaning "not read
    // yet"; after this runs it is always a string (possibly empty, meaning "no fragment at all") — never
    // collapsed back to `null`, so the next effect doesn't mistake "read, and empty" for "hasn't run yet"
    // and leave the page stuck on "Loading" forever, which an earlier version of this effect did.
    const fromHash = typeof window !== "undefined" ? window.location.hash.replace(/^#/, "") : "";
    setToken(fromHash);
  }, []);

  useEffect(() => {
    if (token === null) return;
    if (token === "") {
      setState("not_found");
      return;
    }
    let cancelled = false;
    retrieveSavedBorrowCheck(token)
      .then((result) => {
        if (cancelled) return;
        setCheck(result);
        setState("found");
      })
      .catch((err) => {
        if (cancelled) return;
        setState(err instanceof SituationApiError && err.status === 404 ? "not_found" : "error");
      });
    return () => {
      cancelled = true;
    };
  }, [token]);

  async function handleDelete() {
    if (!token) return;
    setDeleteState("deleting");
    setDeleteError(null);
    try {
      await deleteSavedBorrowCheck(token);
      setDeleteState("deleted");
    } catch {
      setDeleteState("idle");
      setDeleteError("Something went wrong. Please try again.");
    }
  }

  if (state === "loading") {
    return (
      <div className={ui.content}>
        <p className={ui.supporting}>Loading your saved check…</p>
      </div>
    );
  }

  if (state === "not_found") {
    return (
      <div className={ui.content}>
        <h2 className={ui.title}>This link is no longer valid</h2>
        <p className={ui.supporting}>
          It may have expired, already been deleted, or the link may be incomplete. You can run a fresh check any time — no sign-in needed.
        </p>
      </div>
    );
  }

  if (state === "error" || !check) {
    return (
      <div className={ui.content}>
        <h2 className={ui.title}>Something went wrong</h2>
        <p className={ui.supporting}>We couldn&apos;t load this saved check just now. Please try again in a moment.</p>
      </div>
    );
  }

  if (deleteState === "deleted") {
    return (
      <div className={ui.content}>
        <h2 className={ui.title}>Saved check deleted</h2>
        <p className={ui.supporting}>This saved check has been removed and this link no longer works.</p>
      </div>
    );
  }

  const situation = SITUATIONS[check.situation_key];
  const barRows: ValueBarRow[] = check.result_bars.map((b) => ({
    label: b.label,
    value: b.value,
    display: b.value === null ? "Not entered" : formatRupees(b.value),
    tone: b.tone as ValueBarRow["tone"],
  }));

  return (
    <div className={ui.content} style={{ maxWidth: 1200 }}>
      <p className={ui.eyebrowTitle}>Your saved check</p>
      <h2 className={ui.title}>{situation.question}</h2>
      <ProvenanceBadge provenance={check.provenance} />
      <p className={ui.disclaimer}>Saved on {new Date(check.created_at).toLocaleDateString()}</p>
      <div className={`${ui.grid} ${styles.resultLayout}`}>
        <div className={ui.colMain}>
          <div className={`${ui.darkPanel} ${styles.resultPanel}`}>
            <p className={ui.darkLabel}>{check.result_title}</p>
            <p className={ui.darkValue}>{check.result_headline}</p>
            <p className={ui.darkNote}>{check.result_detail}</p>
          </div>
          <div className={`${ui.insightCard} ${styles.resultInsight}`}>
            <p className={ui.insightTitle}>What this tells you</p>
            <p className={ui.insightBody}>{check.result_insight}</p>
          </div>
          <div className={`${ui.insightCard} ${styles.resultWhatIf}`}>
            <p className={ui.insightTitle}>What if?</p>
            <p className={ui.insightBody}>{check.result_scenario}</p>
          </div>
          <div className={`${ui.notice} ${styles.resultLimit}`}>
            <strong>What this cannot tell you yet</strong>
            <p style={{ margin: "6px 0 0" }}>{situation.gap}</p>
          </div>
          {deleteError ? (
            <p className={ui.errorText} role="alert">
              {deleteError}
            </p>
          ) : null}
          <div className={`${ui.actionsRow} ${styles.resultActions}`} style={{ marginTop: 16 }}>
            <button type="button" className={ui.secondaryButton} onClick={() => void handleDelete()} disabled={deleteState === "deleting"}>
              {deleteState === "deleting" ? "Deleting…" : "Delete this saved check"}
            </button>
          </div>
        </div>
        <div className={ui.colSide}>
          <div className={`${ui.card} ${styles.resultChart}`}>
            <h3 className={ui.cardHeading}>{check.result_title}</h3>
            {barRows.length ? <ValueBars summary={check.result_title} rows={barRows} /> : <p className={ui.disclaimer}>There is no trustworthy rupee chart without a value to compare.</p>}
            <p className={ui.disclaimer} style={{ marginTop: 12 }}>
              {check.result_note}
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}
