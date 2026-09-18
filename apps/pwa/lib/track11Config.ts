import track11Config from "../../../shared/track11_config.json";

function readFlag(value: string | undefined, fallback: boolean): boolean {
  if (value === "true") return true;
  if (value === "false") return false;
  return fallback;
}

export const TRACK11_VERSION = track11Config.track11Version;
export const BORROW_ILLUSTRATIVE_ANNUAL_RATE_PERCENT = track11Config.borrowIllustrativeAnnualRatePercent;
export const BORROW_ILLUSTRATIVE_RATE_EFFECTIVE_DATE = track11Config.borrowIllustrativeRateEffectiveDate;
export const TRACK11A_ENABLED = readFlag(process.env.NEXT_PUBLIC_TRACK_11A_ENABLED, track11Config.track11aEnabled);
export const TRACK11B_ENABLED = readFlag(process.env.NEXT_PUBLIC_TRACK_11B_ENABLED, track11Config.track11bEnabled);