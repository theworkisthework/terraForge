import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { PanelHeading } from "./PanelHeading";

describe("PanelHeading", () => {
  it("renders the Properties label", () => {
    render(<PanelHeading />);
    expect(screen.getByText("Properties")).toBeInTheDocument();
  });
});
