import { describe, it, expect, vi } from "vitest";
import { fireEvent, render, screen } from "@testing-library/react";
import { TabHeader } from "./TabHeader";

describe("TabHeader", () => {
  it("renders tabs with correct selected state and forwards tab changes", () => {
    const onTabChange = vi.fn();

    render(
      <TabHeader<"machines" | "application">
        ariaLabel="Configuration sections"
        activeTab="machines"
        onTabChange={onTabChange}
        tabs={[
          { id: "machines", label: "Machine Configurations" },
          { id: "application", label: "Application Configuration" },
        ]}
      />,
    );

    expect(screen.getByRole("tablist")).toHaveAttribute(
      "aria-label",
      "Configuration sections",
    );

    const machineTab = screen.getByRole("tab", {
      name: "Machine Configurations",
    });
    const appTab = screen.getByRole("tab", {
      name: "Application Configuration",
    });

    expect(machineTab).toHaveAttribute("aria-selected", "true");
    expect(appTab).toHaveAttribute("aria-selected", "false");

    fireEvent.click(appTab);
    expect(onTabChange).toHaveBeenCalledWith("application");
  });

  it("applies optional className to the tablist container", () => {
    render(
      <TabHeader<"layer" | "color">
        ariaLabel="Path grouping mode"
        activeTab="layer"
        onTabChange={() => {}}
        tabs={[
          { id: "layer", label: "By Layer" },
          { id: "color", label: "By Colour" },
        ]}
        className="border-b-0"
      />,
    );

    expect(screen.getByRole("tablist")).toHaveClass("border-b-0");
  });
});
