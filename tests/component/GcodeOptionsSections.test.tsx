import { describe, it, expect, vi } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import { PathsSection } from "../../src/renderer/src/features/gcode-options/components/PathsSection";
import { OptionsSection } from "../../src/renderer/src/features/gcode-options/components/OptionsSection";
import { OutputSection } from "../../src/renderer/src/features/gcode-options/components/OutputSection";
import { CustomGcodeSection } from "../../src/renderer/src/features/gcode-options/components/CustomGcodeSection";
import {
  DEFAULT_GCODE_PREFS,
  type GcodePrefs,
} from "../../src/renderer/src/features/gcode-options/gcodePrefs";

function buildPrefs(patch: Partial<GcodePrefs> = {}): GcodePrefs {
  return { ...DEFAULT_GCODE_PREFS, ...patch };
}

describe("Gcode options extracted sections", () => {
  it("PathsSection toggles path options and forwards tolerance input", () => {
    const onToggleOpen = vi.fn();
    const onTogglePref = vi.fn();
    const onJoinToleranceChange = vi.fn();

    render(
      <PathsSection
        open
        prefs={buildPrefs()}
        onToggleOpen={onToggleOpen}
        onTogglePref={onTogglePref}
        onJoinToleranceChange={onJoinToleranceChange}
      />,
    );

    fireEvent.click(screen.getByRole("button", { name: "Paths" }));
    expect(onToggleOpen).toHaveBeenCalledTimes(1);

    fireEvent.click(screen.getByRole("checkbox", { name: "Optimise paths" }));
    expect(onTogglePref).toHaveBeenCalledWith("optimise");

    fireEvent.change(screen.getByRole("spinbutton"), {
      target: { value: "0.75" },
    });
    expect(onJoinToleranceChange).toHaveBeenCalledWith("0.75");
  });

  it("OptionsSection emits clip and preference updates", () => {
    const onToggleOpen = vi.fn();
    const onToggleCustomGcodeOpen = vi.fn();
    const onTogglePref = vi.fn();
    const onSetClipMode = vi.fn();
    const onSetClipOffset = vi.fn();
    const onSetTextField = vi.fn((key: keyof GcodePrefs) => (value: string) => {
      void key;
      void value;
    });

    render(
      <OptionsSection
        open
        customGcodeOpen={false}
        prefs={buildPrefs({ clipMode: "page" })}
        hasPageTemplate
        onToggleOpen={onToggleOpen}
        onToggleCustomGcodeOpen={onToggleCustomGcodeOpen}
        onTogglePref={onTogglePref}
        onSetClipMode={onSetClipMode}
        onSetClipOffset={onSetClipOffset}
        onSetTextField={onSetTextField}
      />,
    );

    fireEvent.click(screen.getByRole("button", { name: "Options" }));
    expect(onToggleOpen).toHaveBeenCalledTimes(1);

    fireEvent.click(
      screen.getByRole("checkbox", { name: "Return to home (X0 Y0)" }),
    );
    expect(onTogglePref).toHaveBeenCalledWith("returnToHome");

    fireEvent.click(screen.getByRole("radio", { name: "Clip to margin" }));
    expect(onSetClipMode).toHaveBeenCalledWith("margin");

    fireEvent.change(screen.getByRole("spinbutton"), {
      target: { value: "2.0" },
    });
    expect(onSetClipOffset).toHaveBeenCalledWith("2.0");

    fireEvent.click(screen.getByRole("button", { name: "Custom G-code" }));
    expect(onToggleCustomGcodeOpen).toHaveBeenCalledTimes(1);
  });

  it("OutputSection shows connection/group warnings and forwards toggles", () => {
    const onToggleOpen = vi.fn();
    const onTogglePref = vi.fn();

    render(
      <OutputSection
        open
        connected={false}
        layerGroupCount={0}
        prefs={buildPrefs({ exportPerGroup: true })}
        onToggleOpen={onToggleOpen}
        onTogglePref={onTogglePref}
      />,
    );

    expect(screen.getByText("(not connected — will be skipped)")).toBeDefined();
    expect(screen.getByText(/No groups defined/i)).toBeDefined();

    fireEvent.click(screen.getByRole("button", { name: "Output" }));
    expect(onToggleOpen).toHaveBeenCalledTimes(1);

    fireEvent.click(screen.getByRole("checkbox", { name: "Save to computer" }));
    expect(onTogglePref).toHaveBeenCalledWith("saveLocally");
  });

  it("CustomGcodeSection toggles and emits text changes", () => {
    const onToggleOpen = vi.fn();
    const onCustomStartChange = vi.fn();
    const onCustomEndChange = vi.fn();

    render(
      <CustomGcodeSection
        open
        prefs={buildPrefs({ customStartGcode: "M3", customEndGcode: "M5" })}
        onToggleOpen={onToggleOpen}
        onCustomStartChange={onCustomStartChange}
        onCustomEndChange={onCustomEndChange}
      />,
    );

    fireEvent.click(screen.getByRole("button", { name: "Custom G-code" }));
    expect(onToggleOpen).toHaveBeenCalledTimes(1);

    fireEvent.change(screen.getByLabelText("Custom start G-code"), {
      target: { value: "G4 P0.2" },
    });
    expect(onCustomStartChange).toHaveBeenCalledWith("G4 P0.2");

    fireEvent.change(screen.getByLabelText("Custom end G-code"), {
      target: { value: "M2" },
    });
    expect(onCustomEndChange).toHaveBeenCalledWith("M2");
  });
});
