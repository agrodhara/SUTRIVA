import { DoorCard } from "../components/DoorCard";

export default function Home() {
  return (
    <main className="shell">
      <section className="hero">
        <p className="eyebrow">Sutriva Alpha</p>
        <h1>
          Make every money decision a <span className="highlight">better</span> one
        </h1>
        <p className="lede">Personalized insights. Smarter choices. Better outcomes.</p>
        <p className="heroTag">2 quick checks. One clearer picture.</p>
      </section>

      <section className="doors" aria-label="Product journeys">
        <DoorCard
          optionLabel="OPTION A"
          title="Get More From My Money"
          description="See whether your current card usage is creating value or quietly costing you money."
          benefits={[
            "Understand whether your card creates value",
            "See the impact of fees and revolving interest",
            "Spot potential value leakage",
            "Know what to review next",
          ]}
          timeEstimate="Takes 2–3 minutes"
          href="/money-value"
          cta="Explore Now"
          journey="money_value"
          accent="moneyValue"
        />
        <DoorCard
          optionLabel="OPTION B"
          title="Borrow Better"
          description="Check whether a desired borrowing amount looks comfortable for your monthly cash flow."
          benefits={[
            "Understand your monthly borrowing comfort",
            "See how current commitments affect cash flow",
            "Check whether the desired amount feels stretched",
            "See what you may want to adjust",
          ]}
          timeEstimate="Takes 2–3 minutes"
          href="/borrow-better"
          cta="Explore Now"
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
