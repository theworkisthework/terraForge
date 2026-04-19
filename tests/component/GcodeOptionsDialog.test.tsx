/**
 * Tests for GcodeOptionsDialog component.
 *
 * Covers: localStorage persistence, toggle interactions, custom G-code section,
 * keyboard handling, "not connected" warning, validation, and confirm/cancel.
 */
import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import {
  GcodeOptionsDialog,
  loadGcodePrefs,
  saveGcodePrefs,
  type GcodePrefs,
} from "@renderer/components/GcodeOptionsDialog";
import { useMachineStore } from "@renderer/store/machineStore";

const STORAGE_KEY = "terraforge.gcodePrefs";

const defaultPrefs: GcodePrefs = {
  optimise: true,
  uploadToSd: true,
  saveLocally: false,
  joinPaths: false,
  joinTolerance: 0.2,
  liftPenAtEnd: true,
  returnToHome: false,
  penDownDelayOverrideEnabled: false,
  penDownDelayMs: 0,
  drawSpeedOverrideEnabled: false,
  drawSpeedOverride: 3000,
  customStartGcode: "",
  customEndGcode: "",
  exportPerGroup: false,
  clipMode: "none",
  clipOffsetMM: 0,
};

beforeEach(() => {
  localStorage.clear();
  useMachineStore.setState({
    configs: [],
    activeConfigId: null,
    status: null,
    connected: false,
    wsLive: false,
    selectedJobFile: null,
    fwInfo: null,
  });
  vi.clearAllMocks();
});

afterEach(() => {
  localStorage.clear();
});

// ── loadGcodePrefs / saveGcodePrefs ───────────────────────────────────────────

describe("loadGcodePrefs", () => {
  it("returns defaults when localStorage is empty", () => {
    const prefs = loadGcodePrefs();
    expect(prefs.optimise).toBe(true);
    expect(prefs.uploadToSd).toBe(true);
    expect(prefs.saveLocally).toBe(false);
    expect(prefs.joinPaths).toBe(false);
  });

  it("returns saved values merged with defaults", () => {
    localStorage.setItem(
      STORAGE_KEY,
      JSON.stringify({ optimise: false, saveLocally: true }),
    );
    const prefs = loadGcodePrefs();
    expect(prefs.optimise).toBe(false);
    expect(prefs.saveLocally).toBe(true);
    // Defaults fill in the rest
    expect(prefs.uploadToSd).toBe(true);
  });

  it("returns defaults when localStorage contains corrupt JSON", () => {
    localStorage.setItem(STORAGE_KEY, "not-valid-json{");
    const prefs = loadGcodePrefs();
    expect(prefs.optimise).toBe(true);
  });
});

describe("saveGcodePrefs", () => {
  it("writes prefs to localStorage", () => {
    const prefs = { ...defaultPrefs, optimise: false };
    saveGcodePrefs(prefs);
    const raw = localStorage.getItem(STORAGE_KEY);
    expect(raw).not.toBeNull();
    const parsed = JSON.parse(raw!);
    expect(parsed.optimise).toBe(false);
  });
});

// ── GcodeOptionsDialog component ─────────────────────────────────────────────

describe("GcodeOptionsDialog", () => {
  const onConfirm = vi.fn();
  const onCancel = vi.fn();

  it("renders the Options heading", () => {
    render(<GcodeOptionsDialog onConfirm={onConfirm} onCancel={onCancel} />);
    expect(
      screen.getByRole("heading", { name: "Generate G-code" }),
    ).toBeInTheDocument();
  });

  it("calls onCancel when Cancel button clicked", async () => {
    render(<GcodeOptionsDialog onConfirm={onConfirm} onCancel={onCancel} />);
    await userEvent.click(screen.getByText("Cancel"));
    expect(onCancel).toHaveBeenCalledTimes(1);
  });

  it("calls onConfirm with current prefs when Generate clicked", async () => {
    render(<GcodeOptionsDialog onConfirm={onConfirm} onCancel={onCancel} />);
    await userEvent.click(screen.getByRole("button", { name: "Generate" }));
    expect(onConfirm).toHaveBeenCalledWith(
      expect.objectContaining({ optimise: true }),
    );
  });

  it("saves prefs to localStorage on confirm", async () => {
    render(<GcodeOptionsDialog onConfirm={onConfirm} onCancel={onCancel} />);
    await userEvent.click(screen.getByRole("button", { name: /paths/i }));
    await userEvent.click(
      screen.getByRole("checkbox", { name: "Optimise paths" }),
    );
    await userEvent.click(screen.getByRole("button", { name: "Generate" }));
    const stored = JSON.parse(localStorage.getItem(STORAGE_KEY)!);
    expect(stored.optimise).toBe(false);
  });

  it("loads prefs from localStorage on mount", async () => {
    localStorage.setItem(
      STORAGE_KEY,
      JSON.stringify({
        optimise: false,
        uploadToSd: true,
        saveLocally: false,
        joinPaths: false,
        joinTolerance: 0.2,
        liftPenAtEnd: true,
        returnToHome: true,
        penDownDelayOverrideEnabled: false,
        penDownDelayMs: 0,
        drawSpeedOverrideEnabled: false,
        drawSpeedOverride: 3000,
        customStartGcode: "",
        customEndGcode: "",
        exportPerGroup: false,
        clipMode: "none",
        clipOffsetMM: 0,
      }),
    );
    render(<GcodeOptionsDialog onConfirm={onConfirm} onCancel={onCancel} />);
    await userEvent.click(screen.getByRole("button", { name: /^paths$/i }));
    await userEvent.click(screen.getByRole("button", { name: /^options$/i }));
    expect(
      screen.getByRole("checkbox", { name: "Optimise paths" }),
    ).not.toBeChecked();
    expect(
      screen.getByRole("checkbox", { name: "Return to home (X0 Y0)" }),
    ).toBeChecked();
  });

  // ── Generate button disabled when neither output selected ─────────────────

  it("disables Generate when neither upload nor save is selected", async () => {
    render(<GcodeOptionsDialog onConfirm={onConfirm} onCancel={onCancel} />);
    // Default has uploadToSd=true — uncheck it
    await userEvent.click(
      screen.getByRole("checkbox", { name: "Upload to SD card" }),
    );
    expect(screen.getByRole("button", { name: "Generate" })).toBeDisabled();
  });

  it("shows validation warning when neither output is selected", async () => {
    render(<GcodeOptionsDialog onConfirm={onConfirm} onCancel={onCancel} />);
    await userEvent.click(
      screen.getByRole("checkbox", { name: "Upload to SD card" }),
    );
    expect(screen.getByText(/Select at least one output/i)).toBeInTheDocument();
  });

  it("re-enables Generate when save to computer is selected", async () => {
    render(<GcodeOptionsDialog onConfirm={onConfirm} onCancel={onCancel} />);
    await userEvent.click(
      screen.getByRole("checkbox", { name: "Upload to SD card" }),
    );
    await userEvent.click(
      screen.getByRole("checkbox", { name: "Save to computer" }),
    );
    expect(screen.getByRole("button", { name: "Generate" })).not.toBeDisabled();
  });

  // ── Keyboard handling ─────────────────────────────────────────────────────

  it("Escape key calls onCancel", () => {
    render(<GcodeOptionsDialog onConfirm={onConfirm} onCancel={onCancel} />);
    const overlay = document.querySelector('[tabindex="-1"]') as HTMLElement;
    fireEvent.keyDown(overlay, { key: "Escape" });
    expect(onCancel).toHaveBeenCalled();
  });

  it("Enter key calls onConfirm when output is selected", () => {
    render(<GcodeOptionsDialog onConfirm={onConfirm} onCancel={onCancel} />);
    const overlay = document.querySelector('[tabindex="-1"]') as HTMLElement;
    fireEvent.keyDown(overlay, { key: "Enter" });
    expect(onConfirm).toHaveBeenCalled();
  });

  it("Enter key does not call onConfirm when neither output selected", async () => {
    render(<GcodeOptionsDialog onConfirm={onConfirm} onCancel={onCancel} />);
    await userEvent.click(
      screen.getByRole("checkbox", { name: "Upload to SD card" }),
    );
    const overlay = document.querySelector('[tabindex="-1"]') as HTMLElement;
    fireEvent.keyDown(overlay, { key: "Enter" });
    expect(onConfirm).not.toHaveBeenCalled();
  });

  it("clicking the backdrop calls onCancel", async () => {
    render(<GcodeOptionsDialog onConfirm={onConfirm} onCancel={onCancel} />);
    const overlay = document.querySelector('[tabindex="-1"]') as HTMLElement;
    await userEvent.click(overlay);
    expect(onCancel).toHaveBeenCalled();
  });

  // ── Toggles ───────────────────────────────────────────────────────────────

  it("toggles Lift pen at end checkbox", async () => {
    render(<GcodeOptionsDialog onConfirm={onConfirm} onCancel={onCancel} />);
    await userEvent.click(screen.getByRole("button", { name: /^options$/i }));
    const cb = screen.getByRole("checkbox", { name: "Lift pen at end" });
    expect(cb).toBeChecked(); // default true
    await userEvent.click(cb);
    expect(cb).not.toBeChecked();
  });

  it("toggles Return to home checkbox", async () => {
    render(<GcodeOptionsDialog onConfirm={onConfirm} onCancel={onCancel} />);
    await userEvent.click(screen.getByRole("button", { name: /^options$/i }));
    const cb = screen.getByRole("checkbox", { name: "Return to home (X0 Y0)" });
    expect(cb).not.toBeChecked(); // default false
    await userEvent.click(cb);
    expect(cb).toBeChecked();
  });

  it("enables pen-down delay override and includes override value on confirm", async () => {
    render(<GcodeOptionsDialog onConfirm={onConfirm} onCancel={onCancel} />);
    await userEvent.click(screen.getByRole("button", { name: /^options$/i }));
    const overrideCb = screen.getByRole("checkbox", {
      name: "Override pen-down delay",
    });
    const delayInput = screen.getByRole("spinbutton", {
      name: "Pen-down delay override (ms)",
    });
    expect(delayInput).toBeDisabled();
    await userEvent.click(overrideCb);
    expect(delayInput).not.toBeDisabled();
    fireEvent.change(delayInput, { target: { value: "125" } });
    await userEvent.click(screen.getByRole("button", { name: "Generate" }));
    expect(onConfirm).toHaveBeenCalledWith(
      expect.objectContaining({
        penDownDelayOverrideEnabled: true,
        penDownDelayMs: 125,
      }),
    );
  });

  it("toggles Join nearby paths checkbox", async () => {
    render(<GcodeOptionsDialog onConfirm={onConfirm} onCancel={onCancel} />);
    await userEvent.click(screen.getByRole("button", { name: /^paths$/i }));
    const cb = screen.getByRole("checkbox", { name: "Join nearby paths" });
    expect(cb).not.toBeChecked();
    await userEvent.click(cb);
    expect(cb).toBeChecked();
  });

  it("tolerance input becomes interactive when Join paths is checked", async () => {
    render(<GcodeOptionsDialog onConfirm={onConfirm} onCancel={onCancel} />);
    await userEvent.click(screen.getByRole("button", { name: /^paths$/i }));
    const joinCb = screen.getByRole("checkbox", { name: "Join nearby paths" });
    const toleranceInput = screen.getByRole("spinbutton");
    expect(toleranceInput).toBeDisabled();
    await userEvent.click(joinCb);
    expect(toleranceInput).not.toBeDisabled();
  });

  it("updates join tolerance value on valid input", async () => {
    render(<GcodeOptionsDialog onConfirm={onConfirm} onCancel={onCancel} />);
    await userEvent.click(screen.getByRole("button", { name: /^paths$/i }));
    await userEvent.click(
      screen.getByRole("checkbox", { name: "Join nearby paths" }),
    );
    const toleranceInput = screen.getByRole("spinbutton");
    fireEvent.change(toleranceInput, { target: { value: "0.5" } });
    await userEvent.click(screen.getByRole("button", { name: "Generate" }));
    expect(onConfirm).toHaveBeenCalledWith(
      expect.objectContaining({ joinTolerance: 0.5 }),
    );
  });

  it("ignores invalid tolerance input (NaN stays at previous value)", async () => {
    render(<GcodeOptionsDialog onConfirm={onConfirm} onCancel={onCancel} />);
    await userEvent.click(screen.getByRole("button", { name: /^paths$/i }));
    await userEvent.click(
      screen.getByRole("checkbox", { name: "Join nearby paths" }),
    );
    const toleranceInput = screen.getByRole("spinbutton");
    await userEvent.clear(toleranceInput);
    await userEvent.type(toleranceInput, "abc");
    await userEvent.click(screen.getByRole("button", { name: "Generate" }));
    // Should confirm with the default tolerance (0.2), not NaN
    expect(onConfirm).toHaveBeenCalledWith(
      expect.objectContaining({ joinTolerance: 0.2 }),
    );
  });

  it("ignores zero tolerance input", async () => {
    render(<GcodeOptionsDialog onConfirm={onConfirm} onCancel={onCancel} />);
    await userEvent.click(screen.getByRole("button", { name: /^paths$/i }));
    await userEvent.click(
      screen.getByRole("checkbox", { name: "Join nearby paths" }),
    );
    const toleranceInput = screen.getByRole("spinbutton");
    await userEvent.clear(toleranceInput);
    await userEvent.type(toleranceInput, "0");
    await userEvent.click(screen.getByRole("button", { name: "Generate" }));
    // tolerance <= 0 is ignored — stays at 0.2
    expect(onConfirm).toHaveBeenCalledWith(
      expect.objectContaining({ joinTolerance: 0.2 }),
    );
  });

  // ── "Not connected" warning on SD card option ─────────────────────────────

  it("shows 'not connected' warning next to Upload to SD card when disconnected", () => {
    useMachineStore.setState({ connected: false });
    render(<GcodeOptionsDialog onConfirm={onConfirm} onCancel={onCancel} />);
    expect(
      screen.getByText(/not connected.*will be skipped/i),
    ).toBeInTheDocument();
  });

  it("does not show 'not connected' warning when connected", () => {
    useMachineStore.setState({ connected: true });
    render(<GcodeOptionsDialog onConfirm={onConfirm} onCancel={onCancel} />);
    expect(
      screen.queryByText(/not connected.*will be skipped/i),
    ).not.toBeInTheDocument();
  });

  // ── Custom G-code section ─────────────────────────────────────────────────

  it("Custom G-code section is collapsed by default", async () => {
    render(<GcodeOptionsDialog onConfirm={onConfirm} onCancel={onCancel} />);
    await userEvent.click(screen.getByRole("button", { name: /^options$/i }));
    expect(
      screen.queryByLabelText("Custom start G-code"),
    ).not.toBeInTheDocument();
  });

  it("clicking Custom G-code expands the section", async () => {
    render(<GcodeOptionsDialog onConfirm={onConfirm} onCancel={onCancel} />);
    await userEvent.click(screen.getByRole("button", { name: /^options$/i }));
    await userEvent.click(screen.getByText("Custom G-code"));
    expect(screen.getByLabelText("Custom start G-code")).toBeInTheDocument();
    expect(screen.getByLabelText("Custom end G-code")).toBeInTheDocument();
  });

  it("clicking Custom G-code again collapses the section", async () => {
    render(<GcodeOptionsDialog onConfirm={onConfirm} onCancel={onCancel} />);
    await userEvent.click(screen.getByRole("button", { name: /^options$/i }));
    await userEvent.click(screen.getByText("Custom G-code"));
    await userEvent.click(screen.getByText("Custom G-code"));
    expect(
      screen.queryByLabelText("Custom start G-code"),
    ).not.toBeInTheDocument();
  });

  it("shows an indicator dot when custom start G-code has content", () => {
    localStorage.setItem(
      STORAGE_KEY,
      JSON.stringify({ ...defaultPrefs, customStartGcode: "M3 S0" }),
    );
    render(<GcodeOptionsDialog onConfirm={onConfirm} onCancel={onCancel} />);
    // The dot is a <span> with bg-accent — check it exists
    const dots = document.querySelectorAll(".bg-accent");
    // At least one such element for the dot indicator
    expect(dots.length).toBeGreaterThan(0);
  });

  it("types into custom start G-code textarea", async () => {
    render(<GcodeOptionsDialog onConfirm={onConfirm} onCancel={onCancel} />);
    await userEvent.click(screen.getByRole("button", { name: /^options$/i }));
    await userEvent.click(screen.getByText("Custom G-code"));
    const startInput = screen.getByLabelText("Custom start G-code");
    await userEvent.type(startInput, "M3 S0");
    await userEvent.click(screen.getByRole("button", { name: "Generate" }));
    expect(onConfirm).toHaveBeenCalledWith(
      expect.objectContaining({ customStartGcode: "M3 S0" }),
    );
  });

  it("types into custom end G-code textarea", async () => {
    render(<GcodeOptionsDialog onConfirm={onConfirm} onCancel={onCancel} />);
    await userEvent.click(screen.getByRole("button", { name: /^options$/i }));
    await userEvent.click(screen.getByText("Custom G-code"));
    const endInput = screen.getByLabelText("Custom end G-code");
    await userEvent.type(endInput, "M5");
    await userEvent.click(screen.getByRole("button", { name: "Generate" }));
    expect(onConfirm).toHaveBeenCalledWith(
      expect.objectContaining({ customEndGcode: "M5" }),
    );
  });

  it("passes all pref values to onConfirm", async () => {
    render(<GcodeOptionsDialog onConfirm={onConfirm} onCancel={onCancel} />);
    await userEvent.click(screen.getByRole("button", { name: "Generate" }));
    expect(onConfirm).toHaveBeenCalledWith({
      optimise: true,
      uploadToSd: true,
      saveLocally: false,
      joinPaths: false,
      joinTolerance: 0.2,
      liftPenAtEnd: true,
      returnToHome: false,
      penDownDelayOverrideEnabled: false,
      penDownDelayMs: 0,
      drawSpeedOverrideEnabled: false,
      drawSpeedOverride: 3000,
      customStartGcode: "",
      customEndGcode: "",
      exportPerGroup: false,
      clipMode: "none",
      clipOffsetMM: 0,
    });
  });
});
