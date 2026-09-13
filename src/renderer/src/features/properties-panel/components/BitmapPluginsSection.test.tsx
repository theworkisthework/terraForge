import { describe, it, expect, beforeEach, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { BitmapPluginsSection } from "./BitmapPluginsSection";
import { useBitmapPluginStore } from "../../../store/bitmapPluginStore";

beforeEach(() => {
  useBitmapPluginStore.setState({ plugins: [], errors: [], scanning: false, actionError: null });
  vi.clearAllMocks();
});

describe("BitmapPluginsSection", () => {
  it("offers a rescan so a newly installed plugin does not need an app restart", async () => {
    const rescanBitmapPlugins = vi.fn().mockResolvedValue(undefined);
    useBitmapPluginStore.setState({ rescanBitmapPlugins });

    render(<BitmapPluginsSection />);
    await userEvent.click(screen.getByRole("button", { name: /rescan/i }));

    expect(rescanBitmapPlugins).toHaveBeenCalledTimes(1);
  });

  it("offers a way to open the plugins folder", async () => {
    const openPluginsFolder = vi.fn().mockResolvedValue(undefined);
    useBitmapPluginStore.setState({ openPluginsFolder });

    render(<BitmapPluginsSection />);
    await userEvent.click(screen.getByRole("button", { name: /open folder/i }));

    expect(openPluginsFolder).toHaveBeenCalledTimes(1);
  });

  it("disables rescan while one is already running", () => {
    useBitmapPluginStore.setState({ scanning: true });

    render(<BitmapPluginsSection />);

    expect(screen.getByRole("button", { name: /rescanning/i })).toBeDisabled();
  });

  it("names the folder and the reason for every rejected plugin", () => {
    useBitmapPluginStore.setState({
      errors: [
        { folder: "acme-halftone", message: 'fields[0].icon must be one of rotate-cw, rotate-ccw' },
        { folder: "wonky", message: "manifest.json is not an object" },
      ],
    });

    render(<BitmapPluginsSection />);

    expect(screen.getByText("acme-halftone")).toBeInTheDocument();
    expect(screen.getByText(/fields\[0\]\.icon must be one of/)).toBeInTheDocument();
    expect(screen.getByText("wonky")).toBeInTheDocument();
    expect(screen.getByText(/manifest\.json is not an object/)).toBeInTheDocument();
  });

  it("shows nothing alarming when every plugin loaded cleanly", () => {
    render(<BitmapPluginsSection />);

    expect(screen.getByRole("button", { name: /rescan/i })).toBeEnabled();
    expect(screen.queryByRole("listitem")).not.toBeInTheDocument();
  });

  it("reports an action that failed outright, such as the folder not opening", () => {
    useBitmapPluginStore.setState({ actionError: "Could not open the plugins folder: no such directory" });

    render(<BitmapPluginsSection />);

    expect(screen.getByText(/Could not open the plugins folder/)).toBeInTheDocument();
  });
});
