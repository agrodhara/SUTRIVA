import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import Home from "./page";

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
});
