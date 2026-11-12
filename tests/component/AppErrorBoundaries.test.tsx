/**
 * What the app does when part of it throws while rendering: a panel is
 * replaced by a message and the rest carries on; anything outside the
 * panels gets the crash screen instead of a blank window.
 */
import { act, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import App from "@renderer/App";
import { useAppConfigStore } from "@renderer/store/appConfigStore";
import { useConsoleStore } from "@renderer/store/consoleStore";
import { useMachineStore } from "@renderer/store/machineStore";
import { useTaskStore } from "@renderer/store/taskStore";

const failing = vi.hoisted(() => ({ canvas: false, bootstrap: false }));

vi.mock("@renderer/components/PlotCanvas", () => ({
  PlotCanvas: () => {
    if (failing.canvas) throw new Error("bad viewBox");
    return <p>the canvas</p>;
  },
}));

vi.mock("@renderer/hooks/useAppBootstrap", () => ({
  useAppBootstrap: () => {
    if (failing.bootstrap) throw new Error("store is corrupt");
  },
}));

beforeEach(() => {
  failing.canvas = false;
  failing.bootstrap = false;
  useMachineStore.setState({ configs: [], activeConfigId: null, status: null, connected: false, wsLive: false });
  useTaskStore.setState({ tasks: {} });
  useAppConfigStore.setState({ showConsoleTimestamps: false });
  useConsoleStore.setState({ lines: [] });
  vi.spyOn(console, "error").mockImplementation(() => {});
});

afterEach(() => vi.restoreAllMocks());

describe("App error boundaries", () => {
  it("keeps the rest of the window working when the canvas throws", async () => {
    failing.canvas = true;
    render(<App />);
    await act(async () => {});

    expect(screen.getByRole("alert")).toHaveTextContent("The canvas hit an error.");
    expect(screen.getByRole("alert")).toHaveTextContent("bad viewBox");
    // The panels around it are still there...
    expect(screen.getByText("File Browser")).toBeInTheDocument();
    expect(screen.getByText("Properties")).toBeInTheDocument();
    expect(document.querySelector('[aria-label="terraForge"]')).toBeInTheDocument();
    // ...and it is not the whole-app crash screen.
    expect(screen.queryByText("terraForge hit an error")).not.toBeInTheDocument();
    expect(useConsoleStore.getState().lines.at(-1)).toBe("[terraForge] The canvas hit an error: bad viewBox");
  });

  it("brings the canvas back on Retry", async () => {
    failing.canvas = true;
    render(<App />);
    await act(async () => {});

    failing.canvas = false;
    await userEvent.click(screen.getByRole("button", { name: "Retry" }));
    expect(screen.getByText("the canvas")).toBeInTheDocument();
    expect(screen.queryByRole("alert")).not.toBeInTheDocument();
  });

  it("shows the crash screen, not a blank window, for an error outside the panels", async () => {
    failing.bootstrap = true;
    const { container } = render(<App />);
    await act(async () => {});

    expect(container).not.toBeEmptyDOMElement();
    expect(screen.getByRole("alert")).toHaveTextContent("terraForge hit an error");
    expect(screen.getByRole("alert")).toHaveTextContent("store is corrupt");
  });

  it("gets back to the app from the crash screen on Try again", async () => {
    failing.bootstrap = true;
    render(<App />);
    await act(async () => {});

    failing.bootstrap = false;
    await userEvent.click(screen.getByRole("button", { name: "Try again" }));
    expect(screen.getByText("File Browser")).toBeInTheDocument();
    expect(screen.getByText("the canvas")).toBeInTheDocument();
    expect(screen.queryByText("terraForge hit an error")).not.toBeInTheDocument();
  });
});
