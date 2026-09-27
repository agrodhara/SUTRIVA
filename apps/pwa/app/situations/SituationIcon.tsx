import type { SituationKey } from "./situationsConfig";

type IconName = SituationKey | "borrow" | "rewards";

/** Small, consistent line icons. Decorative only; the adjacent question is the accessible label. */
export function SituationIcon({ name, size = 28 }: { name: IconName; size?: number }) {
  const common = { fill: "none", stroke: "currentColor", strokeWidth: 1.8, strokeLinecap: "round" as const, strokeLinejoin: "round" as const };
  const paths: Record<IconName, React.ReactNode> = {
    debt: <><rect x="4" y="4" width="16" height="16" rx="3" /><path d="M8 9h8M8 13h5M8 17h3" /><path d="m14 16 2 2 4-5" /></>,
    purchase: <><path d="m5 15 2-6a2 2 0 0 1 2-1h6a2 2 0 0 1 2 1l2 6" /><path d="M4 15h16v5h-2v-2H6v2H4z" /><path d="M7 15h2m6 0h2" /></>,
    offer: <><path d="M6 3h9l4 4v14H6zM15 3v5h4M9 12h7M9 16h5" /></>,
    rejected: <><circle cx="10" cy="10" r="6" /><path d="m15 15 6 6M8 10h4" /></>,
    fee: <><rect x="4" y="5" width="16" height="15" rx="2" /><path d="M4 10h16M8 3v4m8-4v4M8 15h8" /></>,
    fit: <><circle cx="12" cy="12" r="8" /><circle cx="12" cy="12" r="4.3" /><circle cx="12" cy="12" r="1" fill="currentColor" stroke="none" /></>,
    balance: <><path d="M12 3v17M5 8h14M5 8 3 13a3 3 0 0 0 6 0L5 8Zm14 0-2 5a3 3 0 0 0 6 0l-2-5Z" /></>,
    multi: <><rect x="3" y="7" width="16" height="12" rx="2" /><path d="M7 5h14v12M3 11h16M7 15h4" /></>,
    unused: <><rect x="4" y="10" width="16" height="11" rx="2" /><path d="M3 7h18v3H3zM12 7v14M12 7c-5 0-5-5-2-5 2 0 2 3 2 5Zm0 0c5 0 5-5 2-5-2 0-2 3-2 5Z" /></>,
    borrow: <><path d="M5 19V8l7-5 7 5v11H5Z" /><path d="M9 19v-7h6v7M3 21h18" /></>,
    rewards: <><rect x="3" y="5" width="18" height="14" rx="2" /><path d="M3 10h18M7 15h4" /><path d="m17 13 .5 1.5L19 15l-1.5.5L17 17l-.5-1.5L15 15l1.5-.5z" /></>,
  };
  return <svg width={size} height={size} viewBox="0 0 24 24" aria-hidden="true" focusable="false" {...common}>{paths[name]}</svg>;
}
