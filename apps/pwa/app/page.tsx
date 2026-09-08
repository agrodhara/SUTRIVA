import { DoorCard } from "../components/DoorCard";

export default function Home() {
  return (
    <main className="shell">
      <section className="hero">
        <p className="eyebrow">Sutriva Alpha</p>
        <h1>Understand your money. Decide better.</h1>
        <p className="lede">
          Start with one quick check. Go deeper only after you see value.
        </p>
      </section>

      <section className="doors" aria-label="Product journeys">
        <DoorCard
          title="Get More From My Money"
          description="See whether your current card usage is creating value or quietly costing you money."
          href="/money-value"
          cta="Check my money value"
          journey="money_value"
        />
        <DoorCard
          title="Borrow Better"
          description="Check whether a desired borrowing amount looks comfortable for your monthly cash flow."
          href="/borrow-better"
          cta="Check borrowing comfort"
          journey="comfortable_borrowing"
        />
      </section>

      <p className="guardrail">
        Alpha note: no lender offers or applications are shown before the legal and partner gate is cleared.
      </p>
    </main>
  );
}
