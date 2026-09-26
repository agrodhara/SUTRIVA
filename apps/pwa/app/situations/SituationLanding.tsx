import Link from "next/link";
import ui from "../../components/journey-ui/journeyUi.module.css";
import styles from "./situations.module.css";
import { SituationIcon } from "./SituationIcon";
import { GROUP_COPY, SITUATIONS, situationsInGroup, otherGroup, type SituationGroup } from "./situationsConfig";

const OTHER_GROUP_HREF: Record<SituationGroup, string> = {
  borrow: "/money-value",
  rewards: "/borrow-better",
};

/**
 * The group landing page a visitor reaches at /borrow-better or /money-value: a hero framing the group,
 * then a choice grid of every situation in it. Every card is a real link (not just a click handler), so a
 * campaign URL can point straight at a situation and a visitor can also reach any situation by choosing it
 * here — the two required entry points share the same underlying route.
 */
export function SituationLanding({ group, onChoose }: { group: SituationGroup; onChoose: (key: string) => void }) {
  const copy = GROUP_COPY[group];
  const other = otherGroup(group);
  return (
    <div className={`${ui.content} ${styles.landing}`}>
      <div className={styles.hero}>
        <div>
          <span className={styles.heroSymbol}><SituationIcon name={group} size={36} /></span>
          <p className={ui.eyebrowTitle}>{copy.eyebrow}</p>
          <h2 className={styles.heroTitle}>{copy.heading}</h2>
          <p className={styles.lead}>{copy.lead}</p>
          <p className={ui.disclaimer}>Explore without a mobile number. Example data is labelled; you can try it, edit it, or enter all your own figures.</p>
        </div>
        <div className={`${ui.card} ${styles.heroCard}`}>
          <strong>What will this tell me?</strong>
          <p className={ui.disclaimer}>Each check answers one narrow question. You can explore every situation before deciding anything else.</p>
          <Link href={OTHER_GROUP_HREF[group]} className={styles.linkButton}>
            Explore {GROUP_COPY[other].eyebrow} →
          </Link>
        </div>
      </div>
      <div className={styles.sectionIntro} aria-hidden="true"><span>Choose the question on your mind</span><span className={styles.sectionRule} /></div>
      <div className={styles.choiceGrid}>
        {situationsInGroup(group).map((key) => {
          const situation = SITUATIONS[key];
          return (
            <button key={key} type="button" className={styles.choice} onClick={() => onChoose(key)}>
              <span className={styles.choiceIcon}><SituationIcon name={key} /></span>
              <span className={styles.choiceText}>
                <span className={styles.choiceTag}>{situation.nav}</span>
                <strong>{situation.arrival}</strong>
                <small>{situation.intro}</small>
              </span>
              <span className={styles.choiceArrow} aria-hidden="true">↗</span>
            </button>
          );
        })}
      </div>
    </div>
  );
}
