import { describe, it, expect, beforeEach, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import { useMachineStore } from "@renderer/store/machineStore";
import { useTaskStore } from "@renderer/store/taskStore";
import { FileBrowserPanel } from "@renderer/components/FileBrowserPanel";
import { createMachineConfig } from "../helpers/factories";

beforeEach(() => {
  const cfg = createMachineConfig({
    connection: { type: "wifi", host: "fluidnc.local", port: 80 },
  });
  useMachineStore.setState({
    configs: [cfg],
    activeConfigId: cfg.id,
    status: null,
    connected: false,
    wsLive: false,
    selectedJobFile: null,
  });
  useTaskStore.setState({ tasks: {} });
  vi.clearAllMocks();
});

describe("FileBrowserPanel", () => {
  it("renders the File Browser heading", () => {
    render(<FileBrowserPanel />);
    expect(screen.getByText("File Browser")).toBeInTheDocument();
  });

  it("renders internal and sdcard sections", () => {
    render(<FileBrowserPanel />);
    expect(screen.getByText(/internal/i)).toBeInTheDocument();
    expect(screen.getByText(/sdcard/i)).toBeInTheDocument();
  });

  it("shows 'Not connected' when disconnected", () => {
    render(<FileBrowserPanel />);
    const msgs = screen.getAllByText("Not connected.");
    expect(msgs.length).toBeGreaterThanOrEqual(1);
  });

  it("renders upload buttons for both filesystems", () => {
    render(<FileBrowserPanel />);
    const btns = screen.getAllByText(/Upload to \//);;
    expect(btns).toHaveLength(2);
  });
});
