/**
 * The screen shown in place of the app when a render error gets past every
 * panel: a way back, and — while a machine is connected — a way to stop it.
 */
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { AppCrashScreen } from "@renderer/components/AppCrashScreen";
import { useCanvasStore } from "@renderer/store/canvasStore";
import { useMachineStore } from "@renderer/store/machineStore";
import { useTaskStore } from "@renderer/store/taskStore";

const mock = (fn: unknown) => fn as ReturnType<typeof vi.fn>;
const error = new Error("Cannot read properties of undefined (reading 'paths')");

function show(onRetry = vi.fn()) {
  render(<AppCrashScreen error={error} onRetry={onRetry} />);
  return onRetry;
}

beforeEach(() => {
  useMachineStore.setState({ connected: false, wsLive: false });
  useCanvasStore.setState({ imports: [], revision: 0, savedRevision: 0 });
  useTaskStore.setState({ tasks: {} });
  mock(window.terraForge.fluidnc.pauseJob).mockReset().mockResolvedValue(undefined);
  mock(window.terraForge.fluidnc.abortJob).mockReset().mockResolvedValue(undefined);
});

describe("AppCrashScreen", () => {
  it("says what went wrong", () => {
    show();
    const alert = screen.getByRole("alert");
    expect(alert).toHaveTextContent("terraForge hit an error");
    expect(alert).toHaveTextContent("Cannot read properties of undefined (reading 'paths')");
    // The stack is there for a bug report, folded away.
    expect(screen.getByText("Details").closest("details")).toHaveTextContent("AppCrashScreen.test");
  });

  it("renders the app again on Try again", async () => {
    const onRetry = show();
    await userEvent.click(screen.getByRole("button", { name: "Try again" }));
    expect(onRetry).toHaveBeenCalledTimes(1);
  });

  it("offers to reload the window", () => {
    show();
    expect(screen.getByRole("button", { name: "Reload window" })).toBeInTheDocument();
  });

  it("warns that reloading discards a layout with unsaved changes", () => {
    useCanvasStore.setState({ imports: [{ id: "i" }] as never, revision: 2, savedRevision: 1 });
    show();
    expect(screen.getByRole("alert")).toHaveTextContent(/unsaved changes.*reloading the window discards it/);
  });

  it("does not warn about a saved layout", () => {
    show();
    expect(screen.getByRole("alert")).not.toHaveTextContent(/unsaved/);
  });

  describe("machine controls", () => {
    it("are not offered when no machine is connected", () => {
      show();
      expect(screen.queryByRole("button", { name: "Pause job" })).not.toBeInTheDocument();
      expect(screen.queryByRole("button", { name: "Abort job" })).not.toBeInTheDocument();
    });

    it("pause the machine, and say that they did", async () => {
      useMachineStore.setState({ connected: true });
      show();
      expect(screen.getByRole("status")).toBeEmptyDOMElement();

      await userEvent.click(screen.getByRole("button", { name: "Pause job" }));
      expect(window.terraForge.fluidnc.pauseJob).toHaveBeenCalledTimes(1);
      await waitFor(() => expect(screen.getByRole("status")).toHaveTextContent("Pause sent."));
    });

    it("say so when a pause could not be sent", async () => {
      useMachineStore.setState({ connected: true });
      mock(window.terraForge.fluidnc.pauseJob).mockRejectedValue(new Error("socket closed"));
      show();

      await userEvent.click(screen.getByRole("button", { name: "Pause job" }));
      await waitFor(() =>
        expect(screen.getByRole("status")).toHaveTextContent("Pause was not sent. The machine may still be moving."),
      );
    });

    it("abort only after confirming", async () => {
      useMachineStore.setState({ connected: true });
      show();

      await userEvent.click(screen.getByRole("button", { name: "Abort job" }));
      expect(window.terraForge.fluidnc.abortJob).not.toHaveBeenCalled();

      await userEvent.click(screen.getByRole("button", { name: "Abort" }));
      expect(window.terraForge.fluidnc.abortJob).toHaveBeenCalledTimes(1);
      await waitFor(() => expect(screen.getByRole("status")).toHaveTextContent("Abort sent."));
    });

    it("do not abort when the confirmation is cancelled", async () => {
      useMachineStore.setState({ connected: true });
      show();

      await userEvent.click(screen.getByRole("button", { name: "Abort job" }));
      await userEvent.click(screen.getByRole("button", { name: "Cancel" }));
      expect(window.terraForge.fluidnc.abortJob).not.toHaveBeenCalled();
      expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
    });
  });
});
