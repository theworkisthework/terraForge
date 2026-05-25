import { describe, it, expect } from "vitest";
import { render, screen } from "@testing-library/react";
import { Badge } from "./Badge";

describe("Badge", () => {
  it("renders its content", () => {
    render(<Badge variant="warning">Experimental</Badge>);

    const badge = screen.getByText("Experimental");
    expect(badge).toBeInTheDocument();
  });

  it.each([
    ["error", "bg-red-500/20 text-red-400 border-red-500/30"],
    ["warning", "bg-amber-500/20 text-amber-400 border-amber-500/30"],
    ["info", "bg-sky-500/20 text-sky-400 border-sky-500/30"],
  ] as const)("applies the %s variant classes", (variant, expectedClass) => {
    render(<Badge variant={variant}>Label</Badge>);

    const badge = screen.getByText("Label");
    expect(badge).toHaveClass(expectedClass);
  });

  it("preserves additional className values", () => {
    render(
      <Badge variant="info" className="uppercase tracking-wide">
        Note
      </Badge>,
    );

    const badge = screen.getByText("Note");
    expect(badge).toHaveClass("uppercase");
    expect(badge).toHaveClass("tracking-wide");
  });
});