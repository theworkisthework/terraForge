import { render, screen, fireEvent } from "@testing-library/react";
import { describe, it, expect, vi } from "vitest";
import { ImportPropertiesForm } from "./ImportPropertiesForm";
import type { SvgImport } from "../../../../../types";

const mockImp: SvgImport = {
  id: "imp-1",
  name: "test.svg",
  paths: [],
  x: 10,
  y: 20,
  scale: 1,
  rotation: 0,
  visible: true,
  svgWidth: 200,
  svgHeight: 100,
  viewBoxX: 0,
  viewBoxY: 0,
  hatchEnabled: false,
  hatchSpacingMM: 1,
  hatchAngleDeg: 45,
};

const baseProps = {
  imp: mockImp,
  bedW: 220,
  bedH: 200,
  pageW: 210,
  pageH: 297,
  marginMM: 20,
  canAlignToTemplate: false,
  templateAlignEnabled: false,
  templateAlignTarget: "page" as const,
  ratioLocked: true,
  rotStep: 45 as const,
  stepFlyoutOpen: false,
  showCentreMarker: false,
  onUpdate: vi.fn(),
  onTemplateAlignEnabledChange: vi.fn(),
  onTemplateAlignTargetChange: vi.fn(),
  onRatioLockedChange: vi.fn(),
  onToggleStepFlyout: vi.fn(),
  onCloseStepFlyout: vi.fn(),
  onSelectRotStep: vi.fn(),
  onToggleCentreMarker: vi.fn(),
  onChangeStrokeWidth: vi.fn(),
  onApplyHatch: vi.fn(),
};

describe("ImportPropertiesForm", () => {
  it("renders X and Y number fields", () => {
    render(<ImportPropertiesForm {...baseProps} />);
    expect(screen.getByText("X (mm)")).toBeTruthy();
    expect(screen.getByText("Y (mm)")).toBeTruthy();
  });

  it("renders Scale and Rotation fields", () => {
    render(<ImportPropertiesForm {...baseProps} />);
    expect(screen.getByText("Scale")).toBeTruthy();
    expect(screen.getByText("Rotation (°)")).toBeTruthy();
  });

  it("renders W and H labels from DimensionsRow", () => {
    render(<ImportPropertiesForm {...baseProps} />);
    expect(screen.getByText("W (mm)")).toBeTruthy();
    expect(screen.getByText("H (mm)")).toBeTruthy();
  });

  it("calls onUpdate when X field changes", () => {
    const onUpdate = vi.fn();
    render(<ImportPropertiesForm {...baseProps} onUpdate={onUpdate} />);
    // The X field label text is "X (mm)" - find the associated input via spinbutton role
    // X, Y, W, H, Scale, Rotation are all spinbuttons; X is first
    const spinbuttons = screen.getAllByRole("spinbutton");
    fireEvent.change(spinbuttons[0], { target: { value: "15" } });
    expect(onUpdate).toHaveBeenCalledWith({ x: 15 });
  });

  it("calls onUpdate when Rotation field changes", () => {
    const onUpdate = vi.fn();
    render(<ImportPropertiesForm {...baseProps} onUpdate={onUpdate} />);
    // Rotation label is "Rotation (°)" — find the input by label
    const rotLabel = screen.getByText("Rotation (°)");
    const rotInput = rotLabel
      .closest("div")
      ?.querySelector("input") as HTMLInputElement;
    fireEvent.change(rotInput, { target: { value: "90" } });
    expect(onUpdate).toHaveBeenCalledWith({ rotation: 90 });
  });

  it("calls onRatioLockedChange when lock button is clicked", () => {
    const onRatioLockedChange = vi.fn();
    const onUpdate = vi.fn();
    render(
      <ImportPropertiesForm
        {...baseProps}
        ratioLocked={true}
        onRatioLockedChange={onRatioLockedChange}
        onUpdate={onUpdate}
      />,
    );
    const lockBtn = screen.getByTitle("Ratio locked — click to unlock");
    fireEvent.click(lockBtn);
    expect(onRatioLockedChange).toHaveBeenCalledWith(false);
  });
});
