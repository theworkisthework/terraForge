import { describe, it, expect, vi, beforeEach } from "vitest";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { GcodePreviewDialog } from "./GcodePreviewDialog";

const api = {
  fs: {
    readFile: vi.fn(),
    saveFileDialog: vi.fn(),
    writeFile: vi.fn(),
  },
  fluidnc: { fetchFileText: vi.fn() },
};

beforeEach(() => {
  vi.resetAllMocks();
  (window as unknown as { terraForge: unknown }).terraForge = api;
});

describe("GcodePreviewDialog", () => {
  it("shows a local file's text and downloads it to the chosen path", async () => {
    api.fs.readFile.mockResolvedValue("G0 X1\nG1 Y2");
    api.fs.saveFileDialog.mockResolvedValue("/out/a.gcode");
    api.fs.writeFile.mockResolvedValue(undefined);
    const onClose = vi.fn();
    render(
      <GcodePreviewDialog
        file={{ path: "/a.gcode", name: "a.gcode", source: "local" }}
        onClose={onClose}
      />,
    );

    const box = await screen.findByLabelText(/G-code of a.gcode/);
    expect(box).toHaveValue("G0 X1\nG1 Y2");

    fireEvent.click(screen.getByRole("button", { name: /Download/ }));
    await waitFor(() =>
      expect(api.fs.writeFile).toHaveBeenCalledWith(
        "/out/a.gcode",
        "G0 X1\nG1 Y2",
      ),
    );

    fireEvent.click(screen.getByRole("button", { name: /Close/ }));
    expect(onClose).toHaveBeenCalled();
  });

  it("fetches SD files from the machine's SD card", async () => {
    api.fluidnc.fetchFileText.mockResolvedValue("M3");
    render(
      <GcodePreviewDialog
        file={{ path: "/b.nc", name: "b.nc", source: "sd" }}
        onClose={() => {}}
      />,
    );
    await screen.findByLabelText(/G-code of b.nc/);
    expect(api.fluidnc.fetchFileText).toHaveBeenCalledWith("/b.nc", "sdcard");
  });

  it("reports a load failure", async () => {
    api.fs.readFile.mockRejectedValue(new Error("nope"));
    render(
      <GcodePreviewDialog
        file={{ path: "/a.gcode", name: "a.gcode", source: "local" }}
        onClose={() => {}}
      />,
    );
    expect(await screen.findByText(/Could not load file: nope/)).toBeTruthy();
  });
});
