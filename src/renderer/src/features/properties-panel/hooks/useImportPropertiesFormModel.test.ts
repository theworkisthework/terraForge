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
        origin: "bottom-left",
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

  it("anchors fit-to-bed to top origin", () => {
    const onUpdate = vi.fn();

    const { result } = renderHook(() =>
      useImportPropertiesFormModel({
        imp,
        bedW: 220,
        bedH: 200,
        origin: "top-left",
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

    result.current.sharedTransformProps.onFitToBed();

    expect(onUpdate).toHaveBeenCalledWith({
      scale: 2.2,
      scaleX: undefined,
      scaleY: undefined,
      x: 0,
      y: -110,
    });
  });

  it("anchors horizontal and vertical fit to right/top origins", () => {
    const onUpdate = vi.fn();

    const { result } = renderHook(() =>
      useImportPropertiesFormModel({
        imp: {
          ...imp,
          scaleX: 1,
          scaleY: 1,
        },
        bedW: 220,
        bedH: 200,
        origin: "top-right",
        pageW: 220,
        pageH: 200,
        marginMM: 20,
        canScaleToTemplate: false,
        templateScaleEnabled: false,
        templateScaleTarget: "page",
        ratioLocked: false,
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

    result.current.sharedTransformProps.onFitHorizontal();
    result.current.sharedTransformProps.onFitVertical();

    expect(onUpdate).toHaveBeenNthCalledWith(1, {
      scaleX: 2.2,
      x: 0,
    });
    expect(onUpdate).toHaveBeenNthCalledWith(2, {
      scaleY: 4,
      y: -200,
    });
  });
});
