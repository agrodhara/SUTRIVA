import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it } from "vitest";
import { Disclosure } from "./Disclosure";

describe("Disclosure", () => {
  it("is closed by default: the toggle is visible, its content is not in the DOM", () => {
    render(
      <Disclosure summary="How this example works">
        <p>Detail text</p>
      </Disclosure>,
    );

    const toggle = screen.getByRole("button", { name: "How this example works" });
    expect(toggle).toHaveAttribute("aria-expanded", "false");
    expect(screen.queryByText("Detail text")).toBeNull();
  });

  it("opens and closes on click, toggling aria-expanded and mounting/unmounting its content", async () => {
    const user = userEvent.setup();
    render(
      <Disclosure summary="How this example works">
        <p>Detail text</p>
      </Disclosure>,
    );
    const toggle = screen.getByRole("button", { name: "How this example works" });

    await user.click(toggle);
    expect(toggle).toHaveAttribute("aria-expanded", "true");
    expect(screen.getByText("Detail text")).toBeInTheDocument();

    await user.click(toggle);
    expect(toggle).toHaveAttribute("aria-expanded", "false");
    expect(screen.queryByText("Detail text")).toBeNull();
  });

  it("associates the toggle with its content via aria-controls", async () => {
    const user = userEvent.setup();
    render(
      <Disclosure summary="How this example works">
        <p>Detail text</p>
      </Disclosure>,
    );
    const toggle = screen.getByRole("button", { name: "How this example works" });
    await user.click(toggle);

    const controlsId = toggle.getAttribute("aria-controls");
    expect(controlsId).toBeTruthy();
    expect(document.getElementById(controlsId as string)).toHaveTextContent("Detail text");
  });

  it("can start open when defaultOpen is set", () => {
    render(
      <Disclosure summary="How this example works" defaultOpen>
        <p>Detail text</p>
      </Disclosure>,
    );
    expect(screen.getByRole("button", { name: "How this example works" })).toHaveAttribute("aria-expanded", "true");
    expect(screen.getByText("Detail text")).toBeInTheDocument();
  });
});
