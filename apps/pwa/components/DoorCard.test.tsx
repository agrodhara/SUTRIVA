import { cleanup, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const { trackEventOnNavigateMock } = vi.hoisted(() => ({ trackEventOnNavigateMock: vi.fn() }));

vi.mock("../lib/api", () => ({ trackEventOnNavigate: trackEventOnNavigateMock }));

import { DoorCard } from "./DoorCard";

afterEach(() => cleanup());

beforeEach(() => {
  trackEventOnNavigateMock.mockReset();
});

const PROPS = {
  optionLabel: "OPTION A",
  title: "Get More From My Money",
  description: "desc",
  benefits: ["a", "b"],
  timeEstimate: "2 minutes",
  href: "/money-value",
  cta: "Open",
  journey: "money_value" as const,
  accent: "moneyValue" as const,
};

describe("DoorCard — reliable door_selected delivery", () => {
  it("reports door_selected via the navigation-safe sender, not the ordinary fire-and-forget one", async () => {
    const user = userEvent.setup();
    render(<DoorCard {...PROPS} />);

    // A real <a href> click would navigate away in a real browser; jsdom doesn't actually navigate, so this
    // click exercises exactly the handler without needing to suppress real navigation.
    await user.click(screen.getByRole("link", { name: /open/i }));

    expect(trackEventOnNavigateMock).toHaveBeenCalledTimes(1);
    expect(trackEventOnNavigateMock).toHaveBeenCalledWith("door_selected", "money_value");
  });

  it("the link itself still carries its real href, independent of tracking", () => {
    render(<DoorCard {...PROPS} />);
    expect(screen.getByRole("link", { name: /open/i })).toHaveAttribute("href", "/money-value");
  });
});
