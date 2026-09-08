import { BackendStatus } from "../components/BackendStatus";
import { DoorCard } from "../components/DoorCard";

export default function Home() {
  return (
    <main className="shell">
      <section className="hero">
        <p className="eyebrow">Sutriva Alpha</p>
        <h1>Make every money decision a better one</h1>
        <p className="lede">Personalized insights. Smarter choices. Better outcomes.</p>
        <BackendStatus />
      </section>

      <section className="doors" aria-label="Product journeys">
        <DoorCard
          title="Get More From My Money"
          optionLabel="OPTION A"
          description="See whether your current card usage is creating value or quietly costing you money."
          href="/money-value"
          cta="Explore Now"
          benefits={["Understand whether your card creates value", "See the impact of fees and interest", "Spot potential value leakage"]}
          timeEstimate="Takes 2–3 minutes"
          journey="money_value"
          accent="moneyValue"
        />
        <DoorCard
          title="Borrow Better"
          optionLabel="OPTION B"
          description="Check whether a desired borrowing amount looks comfortable for your monthly cash flow."
          href="/borrow-better"
          cta="Explore Now"
          benefits={["Understand your monthly borrowing comfort", "See how commitments affect cash flow", "See what you may want to adjust"]}
          timeEstimate="Takes 2–3 minutes"
          journey="comfortable_borrowing"
          accent="borrowBetter"
        />
      </section>

      <p className="guardrail">
        Alpha note: no lender offers or applications are shown before the legal and partner gate is cleared.
      </p>
    </main>
  );
}
