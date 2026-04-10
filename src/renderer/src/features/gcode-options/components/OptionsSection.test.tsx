import { describe, it, expect, vi } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import { OptionsSection } from "./OptionsSection";
import { DEFAULT_GCODE_PREFS, type GcodePrefs } from "../gcodePrefs";

function buildPrefs(patch: Partial<GcodePrefs> = {}): GcodePrefs {
  return { ...DEFAULT_GCODE_PREFS, ...patch };
}

describe("OptionsSection", () => {
  it("emits clip and preference updates", () => {
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
});
