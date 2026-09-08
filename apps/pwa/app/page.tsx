import { DoorCard } from "../components/DoorCard";

export default function Home() {
  return (
    <main className="shell">
      <section className="hero">
        <p className="eyebrow">Sutriva Alpha</p>
        <h1>Make every money decision a better one.</h1>
        <p className="lede">
          Personalized insights. Smarter choices. Better outcomes.
        </p>
      </section>

      <section className="doors" aria-label="Product journeys">
        <DoorCard
          title="Get More From My Money"
          description="See whether your current card usage is creating value or quietly costing you money."
          href="/money-value"
          cta="Check my money value"
          benefits={[
            "Understand whether your card creates value",
            "See the impact of fees and interest",
            "Spot potential value leakage"
          ]}
        />
        <DoorCard
          title="Borrow Better"
          description="Check whether a desired borrowing amount looks comfortable for your monthly cash flow."
          href="/borrow-better"
          cta="Check borrowing comfort"
          benefits={[
            "Understand your monthly borrowing comfort",
            "See how commitments affect cash flow",
            "See what you may want to adjust"
          ]}
        />
      </section>

      <p className="guardrail">
        Alpha quick checks use only the details you enter. No lender offers or applications are shown.
      </p>
    </main>
  );
}
