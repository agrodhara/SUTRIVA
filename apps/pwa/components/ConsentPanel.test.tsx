import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";

import { ConsentPanel } from "./ConsentPanel";

describe("ConsentPanel", () => {
  it("requires explicit consent before continuing", async () => {
    const onContinue = vi.fn();
    const onDismiss = vi.fn();
    const user = userEvent.setup();

    render(<ConsentPanel journey="money_value" onContinue={onContinue} onDismiss={onDismiss} />);

    const checkbox = screen.getByRole("checkbox", { name: /i understand/i });
    const continueButton = screen.getByRole("button", { name: /i want to keep exploring/i });
    const dismissButton = screen.getByRole("button", { name: /not now/i });

    expect(checkbox).not.toBeChecked();
    expect(continueButton).toBeDisabled();

    await user.click(checkbox);
    expect(checkbox).toBeChecked();
    expect(continueButton).toBeEnabled();

    await user.click(continueButton);
    expect(onContinue).toHaveBeenCalledTimes(1);
    expect(onDismiss).not.toHaveBeenCalled();

    await user.click(dismissButton);
    expect(onDismiss).toHaveBeenCalledTimes(1);
  });
});
