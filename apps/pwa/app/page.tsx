import { BackendStatus } from "../components/BackendStatus";
import { DoorCard } from "../components/DoorCard";
import { JourneyHeader } from "../components/journey-ui/JourneyHeader";
import ui from "../components/journey-ui/journeyUi.module.css";

export default function Home() {
  return (
    <main className={ui.root}>
      <JourneyHeader journeyName="Choose a journey" step={1} />
      <div className="shell">
      <section className="hero">
        <p className="eyebrow">Sutriva Alpha</p>
        <h1>Make every money decision a better one</h1>
        <p className="lede">
          Choose the route that fits your next step and get a clearer view of value, costs, and borrowing comfort.
        </p>
        <div className="heroMeta" aria-label="Journey overview">
          <span className="heroTag">Private, lightweight check-in</span>
          <span className="heroTag heroTag--secondary">2–3 minutes each</span>
        </div>
        <BackendStatus />
      </section>

      <section className="doors" aria-label="Product journeys">
        <DoorCard
          title="Get More From My Money"
          optionLabel="OPTION A"
          description="See whether your card spending is creating value or quietly leaking money through fees and interest."
          href="/money-value"
          cta="Open Get More From My Money"
          benefits={["Understand whether your card creates value", "Spot costs from interest, fees and leakage", "Review the trade-offs before you act"]}
          timeEstimate="Takes 2–3 minutes"
          journey="money_value"
          accent="moneyValue"
        />
        <DoorCard
          title="Borrow Better"
          optionLabel="OPTION B"
          description="Check whether a desired borrowing amount feels comfortable for your monthly cash flow and commitments."
          href="/borrow-better"
          cta="Open Borrow Better"
          benefits={["Understand your monthly borrowing comfort", "See how commitments affect cash flow", "Spot what you may want to adjust first"]}
          timeEstimate="Takes 2–3 minutes"
          journey="comfortable_borrowing"
          accent="borrowBetter"
        />
      </section>

      <p className="guardrail">
        Alpha note: no lender offers or applications are shown before the legal and partner gate is cleared.
      </p>
      </div>
    </main>
  );
}
