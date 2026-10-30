import { describe, it, expect, beforeEach, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { RendererPluginsSection } from "./RendererPluginsSection";
import { useRendererPluginStore } from "../../../../store/rendererPluginStore";
import type { RendererPluginManifest } from "../../../../../../types";

const manifest = (id: string, label: string): RendererPluginManifest => ({
  id,
  label,
  apiVersion: 1,
  defaults: {},
  fields: [],
});

beforeEach(() => {
  useRendererPluginStore.setState({
    plugins: [],
    errors: [],
    scanning: false,
    actionError: null,
    lastInstall: null,
  });
  vi.clearAllMocks();
});

describe("RendererPluginsSection", () => {
  it("offers a rescan so a newly installed plugin does not need an app restart", async () => {
    const rescanRendererPlugins = vi.fn().mockResolvedValue(undefined);
    useRendererPluginStore.setState({ rescanRendererPlugins });

    render(<RendererPluginsSection />);
    await userEvent.click(screen.getByRole("button", { name: /rescan/i }));

    expect(rescanRendererPlugins).toHaveBeenCalledTimes(1);
  });

  it("offers a way to open the plugins folder", async () => {
    const openPluginsFolder = vi.fn().mockResolvedValue(undefined);
    useRendererPluginStore.setState({ openPluginsFolder });

    render(<RendererPluginsSection />);
    await userEvent.click(screen.getByRole("button", { name: /open plugins folder/i }));

    expect(openPluginsFolder).toHaveBeenCalledTimes(1);
  });

  it("disables rescan while one is already running", () => {
    useRendererPluginStore.setState({ scanning: true });

    render(<RendererPluginsSection />);

    expect(screen.getByRole("button", { name: /rescanning/i })).toBeDisabled();
  });

  it("lists what is installed", () => {
    useRendererPluginStore.setState({
      plugins: [manifest("acme.halftone", "Acme Halftone"), manifest("wave", "Wave Lines")],
    });

    render(<RendererPluginsSection />);

    expect(screen.getByText("Acme Halftone")).toBeInTheDocument();
    expect(screen.getByText("(acme.halftone)")).toBeInTheDocument();
    expect(screen.getByText("Wave Lines")).toBeInTheDocument();
  });

  it("says so plainly when nothing is installed", () => {
    render(<RendererPluginsSection />);

    expect(screen.getByText(/no renderer plugins installed/i)).toBeInTheDocument();
  });

  it("names the folder and the reason for every rejected plugin", () => {
    useRendererPluginStore.setState({
      errors: [
        { folder: "acme-halftone", message: "fields[0].icon must be one of rotate-cw, rotate-ccw" },
        { folder: "wonky", message: "manifest.json is not an object" },
      ],
    });

    render(<RendererPluginsSection />);

    expect(screen.getByText("acme-halftone")).toBeInTheDocument();
    expect(screen.getByText(/fields\[0\]\.icon must be one of/)).toBeInTheDocument();
    expect(screen.getByText("wonky")).toBeInTheDocument();
    expect(screen.getByText(/manifest\.json is not an object/)).toBeInTheDocument();
  });

  it("reports an action that failed outright, such as the folder not opening", () => {
    useRendererPluginStore.setState({
      actionError: "Could not open the plugins folder: no such directory",
    });

    render(<RendererPluginsSection />);

    expect(screen.getByText(/Could not open the plugins folder/)).toBeInTheDocument();
  });

  it("offers the bundled examples so there is something to try without downloading anything", async () => {
    const installExamplePlugins = vi.fn().mockResolvedValue(undefined);
    useRendererPluginStore.setState({ installExamplePlugins });

    render(<RendererPluginsSection />);
    await userEvent.click(screen.getByRole("button", { name: /install examples/i }));

    expect(installExamplePlugins).toHaveBeenCalledTimes(1);
  });

  it("says what the install actually did", () => {
    useRendererPluginStore.setState({
      lastInstall: { installed: ["spirograph"], skipped: ["tonal-lines"], unsupported: [] },
    });

    render(<RendererPluginsSection />);

    expect(screen.getByText(/Installed spirograph\./)).toBeInTheDocument();
    expect(screen.getByText(/Left tonal-lines alone/)).toBeInTheDocument();
  });

  it("does not imply it installed something when everything was already there", () => {
    useRendererPluginStore.setState({
      lastInstall: { installed: [], skipped: ["spirograph"], unsupported: [] },
    });

    render(<RendererPluginsSection />);

    expect(screen.getByText(/No new examples to install/)).toBeInTheDocument();
  });

  it("explains an example it held back rather than silently ignoring it", () => {
    useRendererPluginStore.setState({
      lastInstall: { installed: ["tonal-lines"], skipped: [], unsupported: ["spirograph"] },
    });

    render(<RendererPluginsSection />);

    expect(screen.getByText(/Held back spirograph/)).toBeInTheDocument();
    expect(screen.getByText(/generators cannot be placed on the bed yet/)).toBeInTheDocument();
  });
});
