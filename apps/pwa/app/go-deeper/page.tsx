"use client";

import { Suspense } from "react";
import { useRouter, useSearchParams } from "next/navigation";

import { ConsentPanel, type ConsentJourney } from "../../components/ConsentPanel";

function normalizeJourney(value: string | null): ConsentJourney | undefined {
  return value === "money_value" || value === "comfortable_borrowing" ? value : undefined;
}

function GoDeeperJourney() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const journey = normalizeJourney(searchParams.get("journey")) ?? "money_value";

  return (
    <ConsentPanel
      journey={journey}
      onContinue={(nextJourney) => {
        const destination = nextJourney === "comfortable_borrowing" ? "/borrow-better" : "/money-value";
        router.push(destination);
      }}
      onDismiss={(nextJourney) => {
        const destination = nextJourney === "comfortable_borrowing" ? "/borrow-better" : "/money-value";
        router.push(destination);
      }}
    />
  );
}

export default function GoDeeperPage() {
  return (
    <Suspense fallback={<ConsentPanel journey="money_value" />}>
      <GoDeeperJourney />
    </Suspense>
  );
}
