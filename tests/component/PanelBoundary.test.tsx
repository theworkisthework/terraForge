/**
 * Error boundaries a user can recover from: ErrorBoundary's reset, and the
 * PanelBoundary that puts a Retry in a failed panel's place.
 */
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { ErrorBoundary } from "@renderer/components/ErrorBoundary";
import { PanelBoundary } from "@renderer/components/PanelBoundary";
import { useAppConfigStore } from "@renderer/store/appConfigStore";
import { useConsoleStore } from "@renderer/store/consoleStore";

/** Whether <Flaky> throws when it renders. */
let broken = true;

function Flaky() {
  if (broken) throw new Error("layer 3 has no paths");
  return <p>panel content</p>;
}

beforeEach(() => {
  broken = true;
  useAppConfigStore.setState({ showConsoleTimestamps: false });
  useConsoleStore.setState({ lines: [] });
  // React logs every error a boundary catches.
  vi.spyOn(console, "error").mockImplementation(() => {});
});

afterEach(() => vi.restoreAllMocks());

describe("ErrorBoundary reset", () => {
  it("renders the children again when the fallback calls reset", async () => {
    render(
      <ErrorBoundary fallback={(error, reset) => <button onClick={reset}>retry after: {error.message}</button>}>
        <Flaky />
      </ErrorBoundary>,
    );
    const retry = screen.getByRole("button", { name: "retry after: layer 3 has no paths" });

    broken = false;
    await userEvent.click(retry);
    expect(screen.getByText("panel content")).toBeInTheDocument();
  });

  it("shows the fallback again when the children still throw", async () => {
    const onError = vi.fn();
    render(
      <ErrorBoundary onError={onError} fallback={(_error, reset) => <button onClick={reset}>retry</button>}>
        <Flaky />
      </ErrorBoundary>,
    );
    await userEvent.click(screen.getByRole("button", { name: "retry" }));

    expect(screen.getByRole("button", { name: "retry" })).toBeInTheDocument();
    expect(onError).toHaveBeenCalledTimes(2);
  });
});

describe("PanelBoundary", () => {
  it("shows the panel when nothing throws", () => {
    broken = false;
    render(
      <PanelBoundary name="file browser">
        <Flaky />
      </PanelBoundary>,
    );
    expect(screen.getByText("panel content")).toBeInTheDocument();
    expect(screen.queryByRole("alert")).not.toBeInTheDocument();
  });

  it("puts a message and Retry in place of a panel that throws, and leaves the rest alone", () => {
    render(
      <div>
        <p>job controls</p>
        <PanelBoundary name="file browser">
          <Flaky />
        </PanelBoundary>
      </div>,
    );

    const alert = screen.getByRole("alert");
    expect(alert).toHaveTextContent("The file browser hit an error.");
    // The reason is there, and in full on hover where it is cut short.
    expect(screen.getByText("layer 3 has no paths")).toHaveAttribute("title", "layer 3 has no paths");
    expect(screen.getByRole("button", { name: "Retry" })).toBeInTheDocument();
    expect(screen.getByText("job controls")).toBeInTheDocument();
  });

  it("fills the panel's space", () => {
    render(
      <PanelBoundary name="canvas">
        <Flaky />
      </PanelBoundary>,
    );
    expect(screen.getByRole("alert")).toHaveClass("h-full", "w-full", "overflow-hidden");
  });

  it("brings the panel back on Retry", async () => {
    render(
      <PanelBoundary name="file browser">
        <Flaky />
      </PanelBoundary>,
    );
    broken = false;
    await userEvent.click(screen.getByRole("button", { name: "Retry" }));

    expect(screen.getByText("panel content")).toBeInTheDocument();
    expect(screen.queryByRole("alert")).not.toBeInTheDocument();
  });

  it("writes the error to the console panel", () => {
    render(
      <PanelBoundary name="properties panel">
        <Flaky />
      </PanelBoundary>,
    );
    expect(useConsoleStore.getState().lines).toEqual([
      "[terraForge] The properties panel hit an error: layer 3 has no paths",
    ]);
  });

  it("fits on one line for a strip, with the classes of the strip it replaces", async () => {
    render(
      <PanelBoundary name="toolbar" shape="row" className="border-b shrink-0">
        <Flaky />
      </PanelBoundary>,
    );
    const alert = screen.getByRole("alert");
    expect(alert).toHaveClass("flex", "items-center", "border-b", "shrink-0");
    expect(alert).toHaveTextContent("The toolbar hit an error.");

    broken = false;
    await userEvent.click(screen.getByRole("button", { name: "Retry" }));
    expect(screen.getByText("panel content")).toBeInTheDocument();
  });

  describe("as an icon, in the collapsed side strip", () => {
    it("is one button that says what happened and retries", async () => {
      render(
        <PanelBoundary name="job controls" shape="icon" className="h-40">
          <Flaky />
        </PanelBoundary>,
      );
      expect(screen.getByRole("alert")).toHaveClass("h-40");
      const retry = screen.getByRole("button", { name: "The job controls hit an error. Retry" });
      expect(retry.title).toContain("layer 3 has no paths");

      broken = false;
      await userEvent.click(retry);
      expect(screen.getByText("panel content")).toBeInTheDocument();
    });

    it("does not also click the strip it sits in, which opens the panel", async () => {
      const openPanel = vi.fn();
      render(
        <div role="presentation" onClick={openPanel}>
          <PanelBoundary name="job controls" shape="icon">
            <Flaky />
          </PanelBoundary>
        </div>,
      );
      await userEvent.click(screen.getByRole("button", { name: /Retry$/ }));
      expect(openPanel).not.toHaveBeenCalled();
    });
  });
});
