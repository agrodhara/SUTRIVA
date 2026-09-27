import { SituationIcon } from "./SituationIcon";
import type { SituationKey } from "./situationsConfig";
import styles from "./situations.module.css";

type Story = { name: string; moment: string; detail: string; figures: readonly string[]; question: string; answer: string };

/** These are fixed, fictional stories. They never read the form or its result. */
const STORIES: Record<SituationKey, Story> = {
  debt: { name: "Riya", moment: "Her EMIs keep adding up", detail: "After rent, groceries and loan payments, she wants to know what is left each month.", figures: ["₹75,000 income", "₹35,000 essentials", "₹32,000 EMIs"], question: "What is left?", answer: "₹8,000 for the month" },
  purchase: { name: "Arjun", moment: "He is thinking of buying a phone", detail: "The EMI sounds small. He checks what is left after his usual monthly costs.", figures: ["₹80,000 phone", "₹20,000 upfront", "₹3,000 EMI × 24 months", "₹45,000 income", "₹28,000 current costs"], question: "What is left after the EMI?", answer: "₹14,000 each month in this example" },
  offer: { name: "Meera", moment: "She received a loan offer", detail: "The EMI looks manageable, but she wants to see what she would pay in total.", figures: ["₹8 lakh loan", "₹22,000 EMI", "48 months"], question: "What is the total cost?", answer: "₹10.56 lakh paid in total, before fees" },
  rejected: { name: "Kabir", moment: "He got less than he asked for", detail: "He cannot learn the lender’s reason here. He can still test the EMI he had in mind.", figures: ["₹95,000 income", "₹60,000 current costs", "₹22,000 hoped-for EMI"], question: "Would that EMI fit?", answer: "₹13,000 left each month in this example" },
  fee: { name: "Ananya", moment: "Her card fee is due", detail: "She wants to compare rewards she actually used with the annual fee.", figures: ["₹4,200 rewards used", "₹3,000 annual fee", "Interest separate"], question: "Did rewards cover the fee?", answer: "₹1,200 more than the fee" },
  fit: { name: "Dev", moment: "He often shops online", detail: "He wonders how much a different reward rate could change the value he gets.", figures: ["₹8,000 online/month", "1% example rate", "3% example rate"], question: "Could the rate matter?", answer: "₹160 difference per month in this example" },
  balance: { name: "Tara", moment: "She sometimes carries a card balance", detail: "She wants to see how interest compares with rewards from the same period.", figures: ["₹2,100 interest", "₹450 reward value", "Same statement period"], question: "Which is larger?", answer: "Interest is ₹1,650 higher" },
  multi: { name: "Nikhil", moment: "He uses two cards", detail: "He wants to see what each card returned after its annual fee.", figures: ["Card 1 rewards: ₹4,200", "Card 1 fee: ₹3,000", "Card 2 rewards: ₹900", "Card 2 fee: ₹1,500"], question: "What does each card return?", answer: "Card 1: +₹1,200 · Card 2: −₹600" },
  unused: { name: "Isha", moment: "Her points are piling up", detail: "She sees 12,000 points, but does not know what her issuer will give for them.", figures: ["12,000 points", "Cash value unknown", "₹3,000 annual fee"], question: "Are they worth the fee?", answer: "Check the issuer’s value first" },
};

export function SituationStory({ situationKey }: { situationKey: SituationKey }) {
  const story = STORIES[situationKey];
  return (
    <aside className={styles.story} aria-label={`Illustrative example: ${story.name}`}>
      <div className={styles.storyTop}>
        <span className={styles.storyIcon}><SituationIcon name={situationKey} size={32} /></span>
        <span className={styles.storyMarker}>A fictional example</span>
      </div>
      <p className={styles.storyName}>{story.name}’s story</p>
      <h3 className={styles.storyMoment}>{story.moment}</h3>
      <p className={styles.storyDetail}>{story.detail}</p>
      <div className={styles.storyFigureGrid} aria-label="Example figures">
        {story.figures.map((figure) => <span key={figure}>{figure}</span>)}
      </div>
      <div className={styles.storyConnector} aria-hidden="true"><span />What the check shows ↓<span /></div>
      <div className={styles.storyPayoff}>
        <span>{story.question}</span>
        <strong>{story.answer}</strong>
      </div>
      <p className={styles.storyFoot}>This is only an example. Your result uses the figures in the form.</p>
    </aside>
  );
}
