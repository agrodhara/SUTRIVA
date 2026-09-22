import { readFileSync } from "node:fs";
import { join } from "node:path";
import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import Home from "../../app/page";

// Vitest runs with css: false, so the responsive guarantees are asserted on the stylesheet source.
const css = readFileSync(join(__dirname, "journeyUi.module.css"), "utf8");

const ruleBody = (selector: string, from = 0) => {
  const start = css.indexOf(`${selector} {`, from);
  expect(start, `missing rule ${selector}`).toBeGreaterThan(-1);
  return css.slice(start, css.indexOf("}", start));
};

describe("journey stylesheet: responsive layout", () => {
  it("is a compact single column below 960px and two columns from 960px", () => {
    expect(css).toMatch(/@media \(min-width: 960px\)/);
    const desktop = css.slice(css.indexOf("@media (min-width: 960px)"));
    expect(desktop).toMatch(/\.grid \{[^}]*display: grid;[^}]*grid-template-columns: minmax\(0, 1\.05fr\) minmax\(0, 1fr\)/);
    expect(ruleBody(".grid")).toMatch(/flex-direction: column/);
    expect(ruleBody(".colMain,\n.colSide")).toMatch(/display: contents/);
  });

  it("keeps desktop content within roughly 1,100 to 1,200px", () => {
    expect(ruleBody(".content")).toMatch(/max-width: 1160px/);
    expect(ruleBody(".headerInner")).toMatch(/max-width: 1160px/);
  });

  it("lets grid children shrink so nothing forces horizontal scroll", () => {
    const desktop = css.slice(css.indexOf("@media (min-width: 960px)"));
    expect(desktop).toMatch(/min-width: 0/);
    expect(ruleBody(".tileRow")).toMatch(/minmax\(0, 1fr\)/);
    expect(ruleBody(".legendRow")).toMatch(/minmax\(0, 1fr\)/);
    expect(ruleBody(".root")).toMatch(/box-sizing: border-box/);
  });

  it("gives every control a touch target of at least 44px and a visible focus ring", () => {
    for (const selector of [".primaryButton", ".secondaryButton", ".backButton", ".linkButton", ".tab"]) {
      expect(ruleBody(selector), selector).toMatch(/min-height: (4[4-9]|[5-9]\d)px/);
    }
    expect(ruleBody(".input,\n.select")).toMatch(/min-height: 5\dpx/);
    expect(css).toMatch(/\.primaryButton:focus-visible[\s\S]*outline: 3px solid var\(--green\)/);
    expect(ruleBody(".input:focus,\n.select:focus")).toMatch(/outline: 3px solid var\(--green\)/);
  });

  it("uses at least a 16px input font so mobile browsers do not zoom on focus", () => {
    expect(ruleBody(".input,\n.select")).toMatch(/font-size: 1[7-9]px/);
  });
});

describe("home (Step 1)", () => {
  it("carries the branded header and step progress, and still only the two journeys", () => {
    const { container } = render(<Home />);
    const header = container.querySelector("header") as HTMLElement;
    expect(header).toHaveTextContent("Sutriva");
    expect(header).toHaveTextContent("Step 1 of 5");
    expect(header.querySelector("svg")).not.toBeNull();
    expect(screen.getAllByRole("link", { name: /^Open / })).toHaveLength(2);
    expect(document.body.textContent ?? "").not.toMatch(/pilot|OTP|mobile number|consent/i);
  });
});
