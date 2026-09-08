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
          description="Find fees, avoidable interest, subscriptions and value leakage."
          href="/money-value"
          cta="Check money value"
        />
        <DoorCard
          title="Borrow Better"
          description="Know the EMI and borrowing range that feels comfortable before you borrow."
          href="/borrow-better"
          cta="Check comfort range"
        />
      </section>

      <p className="guardrail">
        Alpha note: no lender offers or applications are shown before the legal and partner gate is cleared.
      </p>
    </main>
  );
}
