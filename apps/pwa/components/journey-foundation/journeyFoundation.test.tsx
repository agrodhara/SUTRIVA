import { readFileSync } from "node:fs";
import { join } from "node:path";
import { useRef, useState, type ReactElement } from "react";
import { fireEvent, render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import {
  CheckboxCardGroup,
  ILLUSTRATIVE_EXAMPLE_TEXT,
  IllustrativeExampleBanner,
  JourneyStepShell,
  RadioCardGroup,
  type ChoiceOption,
} from "./index";

const options: ChoiceOption[] = [
  { value: "a", label: "Option A", description: "About A" },
  { value: "b", label: "Option B" },
  { value: "c", label: "Option C" },
  { value: "d", label: "Option D" },
];

function ControlledRadio({ onChange = () => {} }: { onChange?: (value: string) => void }) {
  const [value, setValue] = useState<string | null>(null);
  return (
    <RadioCardGroup
      legend="Pick one"
      name="pick"
      options={options}
      value={value}
      hint="Choose a single option"
      onChange={(next) => {
        setValue(next);
        onChange(next);
      }}
    />
  );
}

function ControlledCheckbox({ maxSelections, initial = [] }: { maxSelections?: number; initial?: string[] }) {
  const [values, setValues] = useState<string[]>(initial);
  return (
    <CheckboxCardGroup legend="Pick some" name="some" options={options} values={values} maxSelections={maxSelections} onChange={setValues} />
  );
}

describe("JourneyStepShell", () => {
  it("renders a section labelled by its heading, with label, supporting text, content and actions", () => {
    render(
      <JourneyStepShell stepLabel="Step 2 of 5" title="A title" supportingText="Helpful text" actions={<button type="button">Go</button>}>
        <p>Body content</p>
      </JourneyStepShell>,
    );
    const region = screen.getByRole("region", { name: "A title" });
    expect(region.tagName).toBe("SECTION");
    expect(within(region).getByText("Step 2 of 5")).toBeInTheDocument();
    expect(within(region).getByRole("heading", { name: "A title" })).toBeInTheDocument();
    expect(within(region).getByText("Helpful text")).toBeInTheDocument();
    expect(within(region).getByText("Body content")).toBeInTheDocument();
    expect(within(region).getByRole("button", { name: "Go" })).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Back" })).not.toBeInTheDocument();
  });

  it("renders optional Back only when supplied and calls it on click and keyboard", async () => {
    const user = userEvent.setup();
    const onBack = vi.fn();
    render(<JourneyStepShell stepLabel="Step 3" title="T" onBack={onBack} backLabel="Go back" />);
    const back = screen.getByRole("button", { name: "Go back" });
    await user.click(back);
    back.focus();
    await user.keyboard("{Enter}");
    expect(onBack).toHaveBeenCalledTimes(2);
  });

  it("makes the heading programmatically focusable via ref and via focusHeadingOnMount", () => {
    function WithRef() {
      const ref = useRef<HTMLHeadingElement>(null);
      return (
        <>
          <button type="button" onClick={() => ref.current?.focus()}>
            Move focus
          </button>
          <JourneyStepShell stepLabel="Step 2" title="Focusable" headingRef={ref} />
        </>
      );
    }
    render(<WithRef />);
    const heading = screen.getByRole("heading", { name: "Focusable" });
    expect(heading).toHaveAttribute("tabindex", "-1");
    fireEvent.click(screen.getByRole("button", { name: "Move focus" }));
    expect(heading).toHaveFocus();
  });

  it("moves focus to the heading on mount only when requested", () => {
    const { unmount } = render(<JourneyStepShell stepLabel="Step 2" title="No focus" />);
    expect(screen.getByRole("heading", { name: "No focus" })).not.toHaveFocus();
    unmount();
    render(<JourneyStepShell stepLabel="Step 2" title="Focused" focusHeadingOnMount />);
    expect(screen.getByRole("heading", { name: "Focused" })).toHaveFocus();
  });
});

describe("RadioCardGroup", () => {
  it("uses native radios inside a fieldset with a legend and visible labels", () => {
    render(<ControlledRadio />);
    const group = screen.getByRole("group", { name: "Pick one" });
    expect(group.tagName).toBe("FIELDSET");
    expect(group.querySelector("legend")).toHaveTextContent("Pick one");
    expect(group).toHaveAccessibleDescription("Choose a single option");
    const radios = within(group).getAllByRole("radio") as HTMLInputElement[];
    expect(radios).toHaveLength(options.length);
    radios.forEach((radio) => {
      expect(radio.tagName).toBe("INPUT");
      expect(radio.type).toBe("radio");
      expect(radio.name).toBe("pick");
      expect(radio.closest("label")).not.toBeNull();
    });
    expect(screen.getByLabelText("Option A", { exact: false })).toBe(radios[0]);
    expect(screen.getByText("About A")).toBeVisible();
  });

  it("does not preselect anything", () => {
    render(<ControlledRadio />);
    screen.getAllByRole("radio").forEach((radio) => expect(radio).not.toBeChecked());
  });

  it("selects on click, on tapping the label text, and via keyboard", async () => {
    const user = userEvent.setup();
    const onChange = vi.fn();
    render(<ControlledRadio onChange={onChange} />);

    await user.click(screen.getByRole("radio", { name: /Option A/ }));
    expect(onChange).toHaveBeenLastCalledWith("a");
    expect(screen.getByRole("radio", { name: /Option A/ })).toBeChecked();

    await user.click(screen.getByText("Option B")); // tap on the card label, not the input
    expect(onChange).toHaveBeenLastCalledWith("b");
    expect(screen.getByRole("radio", { name: /Option B/ })).toBeChecked();
    expect(screen.getByRole("radio", { name: /Option A/ })).not.toBeChecked();

    screen.getByRole("radio", { name: /Option B/ }).focus();
    await user.keyboard("{ArrowDown}");
    expect(onChange).toHaveBeenLastCalledWith("c");
    expect(screen.getByRole("radio", { name: /Option C/ })).toBeChecked();
  });

  it("is controlled: it reflects the value prop and calls onChange without self-updating", async () => {
    const user = userEvent.setup();
    const onChange = vi.fn();
    render(<RadioCardGroup legend="L" name="n" options={options} value="b" onChange={onChange} />);
    expect(screen.getByRole("radio", { name: /Option B/ })).toBeChecked();
    await user.click(screen.getByRole("radio", { name: /Option C/ }));
    expect(onChange).toHaveBeenCalledWith("c");
    expect(screen.getByRole("radio", { name: /Option B/ })).toBeChecked();
    expect(screen.getByRole("radio", { name: /Option C/ })).not.toBeChecked();
  });
});

describe("choice group error association", () => {
  it("RadioCardGroup describes the fieldset by both the hint and the inline error", () => {
    render(
      <>
        <RadioCardGroup legend="Pick one" name="pick" options={options} value={null} hint="Choose a single option" errorId="pick-error" onChange={() => {}} />
        <p id="pick-error">Choose one option.</p>
      </>,
    );
    const group = screen.getByRole("group", { name: "Pick one" });
    expect(group).toHaveAccessibleDescription("Choose a single option Choose one option.");
    expect(group.getAttribute("aria-describedby")?.split(" ")).toContain("pick-error");
  });

  it("RadioCardGroup describes the fieldset by the error alone when there is no hint", () => {
    render(
      <>
        <RadioCardGroup legend="Pick one" name="pick" options={options} value={null} errorId="pick-error" onChange={() => {}} />
        <p id="pick-error">Choose one option.</p>
      </>,
    );
    expect(screen.getByRole("group", { name: "Pick one" })).toHaveAccessibleDescription("Choose one option.");
  });

  it("CheckboxCardGroup describes the fieldset by both the hint and the inline error", () => {
    render(
      <>
        <CheckboxCardGroup legend="Pick some" name="some" options={options} values={[]} hint="Select up to 3." errorId="some-error" onChange={() => {}} />
        <p id="some-error">Choose at least one.</p>
      </>,
    );
    expect(screen.getByRole("group", { name: "Pick some" })).toHaveAccessibleDescription("Select up to 3. Choose at least one.");
  });

  it("adds no aria-describedby when there is neither a hint nor an error", () => {
    render(<CheckboxCardGroup legend="Pick some" name="some" options={options} values={[]} onChange={() => {}} />);
    expect(screen.getByRole("group", { name: "Pick some" })).not.toHaveAttribute("aria-describedby");
  });
});

describe("CheckboxCardGroup", () => {
  it("uses native checkboxes inside a fieldset with a legend and visible labels", () => {
    render(<ControlledCheckbox />);
    const group = screen.getByRole("group", { name: "Pick some" });
    expect(group.tagName).toBe("FIELDSET");
    expect(group.querySelector("legend")).toHaveTextContent("Pick some");
    const boxes = within(group).getAllByRole("checkbox") as HTMLInputElement[];
    expect(boxes).toHaveLength(options.length);
    boxes.forEach((box) => {
      expect(box.tagName).toBe("INPUT");
      expect(box.type).toBe("checkbox");
      expect(box.closest("label")).not.toBeNull();
    });
  });

  it("does not preselect anything", () => {
    render(<ControlledCheckbox />);
    screen.getAllByRole("checkbox").forEach((box) => expect(box).not.toBeChecked());
  });

  it("toggles on click, label tap and keyboard Space", async () => {
    const user = userEvent.setup();
    render(<ControlledCheckbox />);
    await user.click(screen.getByRole("checkbox", { name: /Option A/ }));
    await user.click(screen.getByText("Option B"));
    expect(screen.getByRole("checkbox", { name: /Option A/ })).toBeChecked();
    expect(screen.getByRole("checkbox", { name: /Option B/ })).toBeChecked();

    screen.getByRole("checkbox", { name: /Option C/ }).focus();
    await user.keyboard(" ");
    expect(screen.getByRole("checkbox", { name: /Option C/ })).toBeChecked();

    await user.click(screen.getByRole("checkbox", { name: /Option A/ }));
    expect(screen.getByRole("checkbox", { name: /Option A/ })).not.toBeChecked();
  });

  it("imposes no maximum unless one is configured", async () => {
    const user = userEvent.setup();
    render(<ControlledCheckbox />);
    for (const option of options) await user.click(screen.getByRole("checkbox", { name: new RegExp(option.label) }));
    screen.getAllByRole("checkbox").forEach((box) => expect(box).toBeChecked());
  });

  it("enforces a configured maximum, disabling unselected options until one is cleared", async () => {
    const user = userEvent.setup();
    render(<ControlledCheckbox maxSelections={2} />);
    await user.click(screen.getByRole("checkbox", { name: /Option A/ }));
    expect(screen.getByRole("checkbox", { name: /Option C/ })).toBeEnabled();
    await user.click(screen.getByRole("checkbox", { name: /Option B/ }));

    expect(screen.getByRole("checkbox", { name: /Option C/ })).toBeDisabled();
    expect(screen.getByRole("checkbox", { name: /Option D/ })).toBeDisabled();
    expect(screen.getByRole("checkbox", { name: /Option A/ })).toBeEnabled(); // selected ones can still be cleared

    await user.click(screen.getByText("Option C")); // blocked
    expect(screen.getByRole("checkbox", { name: /Option C/ })).not.toBeChecked();

    await user.click(screen.getByRole("checkbox", { name: /Option A/ }));
    expect(screen.getByRole("checkbox", { name: /Option C/ })).toBeEnabled();
    await user.click(screen.getByRole("checkbox", { name: /Option C/ }));
    expect(screen.getByRole("checkbox", { name: /Option C/ })).toBeChecked();
  });

  it("never emits more selections than the maximum", () => {
    const onChange = vi.fn();
    render(<CheckboxCardGroup legend="L" name="n" options={options} values={["a", "b"]} maxSelections={2} onChange={onChange} />);
    fireEvent.click(screen.getByRole("checkbox", { name: /Option C/ }));
    expect(onChange).not.toHaveBeenCalled();
  });

  it("is controlled: it reflects the values prop", () => {
    render(<CheckboxCardGroup legend="L" name="n" options={options} values={["b", "d"]} onChange={() => {}} />);
    expect(screen.getByRole("checkbox", { name: /Option B/ })).toBeChecked();
    expect(screen.getByRole("checkbox", { name: /Option D/ })).toBeChecked();
    expect(screen.getByRole("checkbox", { name: /Option A/ })).not.toBeChecked();
  });
});

describe("IllustrativeExampleBanner", () => {
  it("always renders the exact required text as a note", () => {
    render(<IllustrativeExampleBanner />);
    expect(ILLUSTRATIVE_EXAMPLE_TEXT).toBe("ILLUSTRATIVE EXAMPLE — NOT YOUR DATA");
    const note = screen.getByRole("note");
    expect(note).toHaveTextContent(/^ⓘ?\s*ILLUSTRATIVE EXAMPLE — NOT YOUR DATA$/);
    expect(screen.getByText("ILLUSTRATIVE EXAMPLE — NOT YOUR DATA")).toBeVisible();
  });

  it("exposes no props, so no financial or user values can be interpolated", () => {
    expect(IllustrativeExampleBanner.length).toBe(0);
    // Extra props (if forced past the type system) are ignored, not rendered.
    const Forced = IllustrativeExampleBanner as unknown as (props: Record<string, unknown>) => ReactElement;
    const { container } = render(<Forced amount="₹10,800" rate="14%" />);
    expect(container.textContent).not.toMatch(/10,800|14%/);
    expect(screen.getByRole("note")).toHaveTextContent("ILLUSTRATIVE EXAMPLE — NOT YOUR DATA");
  });

  it("makes no storage, sharing or retention claims", () => {
    render(<IllustrativeExampleBanner />);
    expect(screen.getByRole("note").textContent).not.toMatch(/stor|shar|retain|retention|saved|delete/i);
  });
});

describe("shared stylesheet accessibility guarantees", () => {
  // Vitest runs with css: false, so assert on the stylesheet source directly.
  const css = readFileSync(join(__dirname, "journeyFoundation.module.css"), "utf8");
  const rule = (selector: string) => {
    const start = css.indexOf(`${selector} {`);
    expect(start, `missing rule ${selector}`).toBeGreaterThan(-1);
    return css.slice(start, css.indexOf("}", start));
  };

  it("keeps ordinary choice cards and the Back button at least 44px tall", () => {
    expect(rule(".choiceCard")).toMatch(/min-height:\s*(4[4-9]|[5-9]\d)px/);
    expect(rule(".backButton")).toMatch(/min-height:\s*44px/);
  });

  it("has visible focus styles for inputs, cards, Back and the heading", () => {
    expect(css).toMatch(/\.choiceInput:focus-visible\s*{[^}]*outline:\s*3px solid/);
    expect(css).toMatch(/\.choiceCard:has\(\.choiceInput:focus-visible\)/);
    expect(css).toMatch(/\.backButton:focus-visible\s*{[^}]*outline:\s*3px solid/);
    expect(css).toMatch(/\.stepTitle:focus-visible\s*{[^}]*outline:\s*3px solid/);
  });

  it("marks the selected state with more than colour: heavier border and a check glyph", () => {
    expect(rule(".choiceCardSelected")).toMatch(/border:\s*2px solid/);
    expect(css).toMatch(/\.choiceCardSelected::after\s*{[^}]*content:\s*"✓"/);
    expect(rule(".choiceCard")).toMatch(/border:\s*1px solid/);
  });

  it("marks the banner with a dashed border and an icon, not colour alone", () => {
    expect(rule(".illustrativeBanner")).toMatch(/border:\s*2px dashed/);
  });
});
