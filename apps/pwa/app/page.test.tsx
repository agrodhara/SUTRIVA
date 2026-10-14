import { render, screen } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

const { ensureAnonymousSessionMock, trackEventOnNavigateMock } = vi.hoisted(() => ({
  ensureAnonymousSessionMock: vi.fn(),
  trackEventOnNavigateMock: vi.fn(),
}));

vi.mock("../lib/api", () => ({
  ensureAnonymousSession: ensureAnonymousSessionMock,
  trackEventOnNavigate: trackEventOnNavigateMock,
}));

import Home from "./page";

beforeEach(() => {
  ensureAnonymousSessionMock.mockReset();
  trackEventOnNavigateMock.mockReset();
});

describe("Home page", () => {
  it("shows both journeys with clear mobile-first copy and calls to action", () => {
    render(<Home />);

    expect(
      screen.getByRole("heading", { name: /make every money decision a better one/i }),
    ).toBeInTheDocument();
    expect(
      screen.getByText(/choose the route that fits your next step/i),
    ).toBeInTheDocument();
    expect(screen.getByRole("link", { name: /open get more from my money/i })).toHaveAttribute(
      "href",
      "/money-value",
    );
    expect(screen.getByRole("link", { name: /open borrow better/i })).toHaveAttribute(
      "href",
      "/borrow-better",
    );
    expect(screen.getByLabelText(/product journeys/i)).toBeInTheDocument();
  });

  it("bootstraps an anonymous session on mount, before any door is clicked", () => {
    render(<Home />);
    expect(ensureAnonymousSessionMock).toHaveBeenCalledTimes(1);
    // Giving the session a head start is the whole point — clicking a door must not be what first
    // establishes it, or trackEventOnNavigate's beacon has nothing to carry.
    expect(trackEventOnNavigateMock).not.toHaveBeenCalled();
  });
});
