import { renderHook } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import type { SvgImport } from "../../../../../types";
import { useImportPropertiesFormModel } from "./useImportPropertiesFormModel";

const imp: SvgImport = {
  id: "imp-1",
  name: "test.svg",
  paths: [],
  x: 0,
  y: 0,
  scale: 1,
  rotation: 0,
  visible: true,
  svgWidth: 100,
  svgHeight: 50,
  viewBoxX: 0,
  viewBoxY: 0,
};

describe("useImportPropertiesFormModel", () => {
  it("exposes stable update handlers that map values correctly", () => {
    const onUpdate = vi.fn();

    const { result } = renderHook(() =>
      useImportPropertiesFormModel({
        imp,
        bedW: 220,
        bedH: 200,
        pageW: 220,
        pageH: 200,
        marginMM: 20,
        canScaleToTemplate: false,
        templateScaleEnabled: false,
        templateScaleTarget: "page",
        ratioLocked: true,
        rotStep: 45,
        stepFlyoutOpen: false,
        showCentreMarker: false,
        onUpdate,
        onRatioLockedChange: vi.fn(),
        onTemplateScaleEnabledChange: vi.fn(),
        onTemplateScaleTargetChange: vi.fn(),
        onToggleStepFlyout: vi.fn(),
        onCloseStepFlyout: vi.fn(),
        onSelectRotStep: vi.fn(),
        onToggleCentreMarker: vi.fn(),
      }),
    );

    result.current.onChangeX(12.5);
    result.current.onAlignY(10.1234);
    result.current.onChangeScale(0);
    result.current.onChangeRotation(90);

    expect(onUpdate).toHaveBeenCalledWith({ x: 12.5 });
    expect(onUpdate).toHaveBeenCalledWith({ y: 10.123 });
    expect(onUpdate).toHaveBeenCalledWith({ scale: 0.001 });
    expect(onUpdate).toHaveBeenCalledWith({ rotation: 90 });
  });
});
