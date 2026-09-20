import { redirect } from "next/navigation";

type SearchParams = Record<string, string | string[] | undefined>;

function normalizeJourney(value: string | string[] | undefined): string | undefined {
  const candidate = Array.isArray(value) ? value[0] : value;
  return candidate === "money_value" || candidate === "comfortable_borrowing" ? candidate : undefined;
}

export default async function GoDeeperPage({ searchParams }: { searchParams?: Promise<SearchParams> }) {
  const journey = normalizeJourney((await searchParams)?.journey);
  redirect(journey === "comfortable_borrowing" ? "/borrow-better" : journey === "money_value" ? "/money-value" : "/");
}
