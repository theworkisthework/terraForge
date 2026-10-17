import { describe, it, expect, beforeEach, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { BitmapPluginsSection } from "./BitmapPluginsSection";
import { useBitmapPluginStore } from "../../../../store/bitmapPluginStore";
import type { BitmapPluginManifest } from "../../../../../../types";

const manifest = (id: string, label: string): BitmapPluginManifest => ({
  id,
  label,
  apiVersion: 1,
  defaults: {},
  fields: [],
});

beforeEach(() => {
  useBitmapPluginStore.setState({
    plugins: [],
    errors: [],
    scanning: false,
    actionError: null,
    lastInstall: null,
  });
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
    await userEvent.click(screen.getByRole("button", { name: /open plugins folder/i }));

    expect(openPluginsFolder).toHaveBeenCalledTimes(1);
  });

  it("disables rescan while one is already running", () => {
    useBitmapPluginStore.setState({ scanning: true });

    render(<BitmapPluginsSection />);

    expect(screen.getByRole("button", { name: /rescanning/i })).toBeDisabled();
  });

  it("lists what is installed", () => {
    useBitmapPluginStore.setState({
      plugins: [manifest("acme.halftone", "Acme Halftone"), manifest("wave", "Wave Lines")],
    });

    render(<BitmapPluginsSection />);

    expect(screen.getByText("Acme Halftone")).toBeInTheDocument();
    expect(screen.getByText("(acme.halftone)")).toBeInTheDocument();
    expect(screen.getByText("Wave Lines")).toBeInTheDocument();
  });

  it("says so plainly when nothing is installed", () => {
    render(<BitmapPluginsSection />);

    expect(screen.getByText(/no renderer plugins installed/i)).toBeInTheDocument();
  });

  it("names the folder and the reason for every rejected plugin", () => {
    useBitmapPluginStore.setState({
      errors: [
        { folder: "acme-halftone", message: "fields[0].icon must be one of rotate-cw, rotate-ccw" },
        { folder: "wonky", message: "manifest.json is not an object" },
      ],
    });

    render(<BitmapPluginsSection />);

    expect(screen.getByText("acme-halftone")).toBeInTheDocument();
    expect(screen.getByText(/fields\[0\]\.icon must be one of/)).toBeInTheDocument();
    expect(screen.getByText("wonky")).toBeInTheDocument();
    expect(screen.getByText(/manifest\.json is not an object/)).toBeInTheDocument();
  });

  it("reports an action that failed outright, such as the folder not opening", () => {
    useBitmapPluginStore.setState({
      actionError: "Could not open the plugins folder: no such directory",
    });

    render(<BitmapPluginsSection />);

    expect(screen.getByText(/Could not open the plugins folder/)).toBeInTheDocument();
  });

  it("offers the bundled examples so there is something to try without downloading anything", async () => {
    const installExamplePlugins = vi.fn().mockResolvedValue(undefined);
    useBitmapPluginStore.setState({ installExamplePlugins });

    render(<BitmapPluginsSection />);
    await userEvent.click(screen.getByRole("button", { name: /install examples/i }));

    expect(installExamplePlugins).toHaveBeenCalledTimes(1);
  });

  it("says what the install actually did", () => {
    useBitmapPluginStore.setState({
      lastInstall: { installed: ["spirograph"], skipped: ["tonal-lines"], unsupported: [] },
    });

    render(<BitmapPluginsSection />);

    expect(screen.getByText(/Installed spirograph\./)).toBeInTheDocument();
    expect(screen.getByText(/Left tonal-lines alone/)).toBeInTheDocument();
  });

  it("does not imply it installed something when everything was already there", () => {
    useBitmapPluginStore.setState({
      lastInstall: { installed: [], skipped: ["spirograph"], unsupported: [] },
    });

    render(<BitmapPluginsSection />);

    expect(screen.getByText(/No new examples to install/)).toBeInTheDocument();
  });

  it("explains an example it held back rather than silently ignoring it", () => {
    useBitmapPluginStore.setState({
      lastInstall: { installed: ["tonal-lines"], skipped: [], unsupported: ["spirograph"] },
    });

    render(<BitmapPluginsSection />);

    expect(screen.getByText(/Held back spirograph/)).toBeInTheDocument();
    expect(screen.getByText(/generators cannot be placed on the bed yet/)).toBeInTheDocument();
  });
});
