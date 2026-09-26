import { IllustrativeExampleBanner } from "../../components/journey-foundation";
import { DeclaredDataBadge } from "../../components/journey-ui/DeclaredDataBadge";
import ui from "../../components/journey-ui/journeyUi.module.css";

export type Provenance = "example" | "mixed" | "own";

export const MIXED_PROVENANCE_TEXT = "EXAMPLE FIGURES + YOUR EDITS — PARTLY YOUR DATA";

/**
 * The three truthful provenance states a result can be in. Editing one prefilled field must never be
 * labelled the same as a screen built entirely from the customer's own entries — "mixed" exists
 * specifically so a single edited field is never presented as "your figures" in full.
 *
 * - "example": every field still holds its example value. Reuses the existing illustrative-example banner.
 * - "mixed": at least one field was edited, but at least one other still holds its example value.
 * - "own": every field was explicitly set by the customer (including re-typing the example's own value,
 *   once "Use my figures" mode is chosen — see SituationFlow's mode handling).
 */
export function ProvenanceBadge({ provenance }: { provenance: Provenance }) {
  if (provenance === "example") return <IllustrativeExampleBanner />;
  if (provenance === "own") return <DeclaredDataBadge />;
  return (
    <p className={ui.exampleBanner} style={{ display: "inline-flex", flexDirection: "row", gap: 8 }} role="note">
      <span className={ui.exampleDot} aria-hidden="true" />
      <span>{MIXED_PROVENANCE_TEXT}</span>
    </p>
  );
}
