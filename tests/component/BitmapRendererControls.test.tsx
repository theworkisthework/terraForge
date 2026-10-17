import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import { ErrorBoundary } from "@renderer/components/ErrorBoundary";
import { RendererFieldControl } from "@renderer/features/properties-panel/components/RendererFieldControl";
import { BitmapRendererSection } from "@renderer/features/properties-panel/components/BitmapRendererSection";
import { useBitmapPluginStore } from "@renderer/store/bitmapPluginStore";
import type {
  BitmapPluginManifest,
  BitmapRendererNumberFieldSchema,
  BitmapRendererSelectFieldSchema,
} from "@types/index";
import { createSvgImport } from "../helpers/factories";

/** React logs every caught render error; that is expected here, not a failure. */
let consoleError: ReturnType<typeof vi.spyOn>;

beforeEach(() => {
  consoleError = vi.spyOn(console, "error").mockImplementation(() => {});
  useBitmapPluginStore.setState({ plugins: [] });
});

afterEach(() => {
  consoleError.mockRestore();
});

function Boom(): never {
  throw new Error("field schema is nonsense");
}

describe("ErrorBoundary", () => {
  it("renders its children when nothing throws", () => {
    render(
      <ErrorBoundary fallback={() => <p>fallback</p>}>
        <p>content</p>
      </ErrorBoundary>,
    );
    expect(screen.getByText("content")).toBeInTheDocument();
  });

  it("shows the fallback instead of unmounting the tree when a child throws", () => {
    render(
      <div>
        <p>sibling survives</p>
        <ErrorBoundary fallback={(error) => <p>caught: {error.message}</p>}>
          <Boom />
        </ErrorBoundary>
      </div>,
    );

    expect(screen.getByText("caught: field schema is nonsense")).toBeInTheDocument();
    expect(screen.getByText("sibling survives")).toBeInTheDocument();
  });

  it("recovers when remounted under a new key", () => {
    const { rerender } = render(
      <ErrorBoundary key="broken" fallback={() => <p>fallback</p>}>
        <Boom />
      </ErrorBoundary>,
    );
    expect(screen.getByText("fallback")).toBeInTheDocument();

    rerender(
      <ErrorBoundary key="healthy" fallback={() => <p>fallback</p>}>
        <p>content</p>
      </ErrorBoundary>,
    );
    expect(screen.getByText("content")).toBeInTheDocument();
    expect(screen.queryByText("fallback")).not.toBeInTheDocument();
  });
});

describe("RendererFieldControl icon fallback", () => {
  it("shows a preset's label when its icon name is unknown to this build", () => {
    const field = {
      type: "number",
      key: "angle",
      label: "Angle",
      min: -180,
      max: 180,
      step: 1,
      presets: [{ label: "+90", delta: 90, icon: "sparkles" }],
    } as unknown as BitmapRendererNumberFieldSchema;

    render(<RendererFieldControl field={field} value={0} onChange={vi.fn()} />);

    expect(screen.getByRole("button", { name: "+90" })).toHaveTextContent("+90");
  });

  it("shows an option's label when its icon name is unknown to this build", () => {
    const field = {
      type: "select",
      key: "axis",
      label: "Axis",
      control: "icon-buttons",
      options: [{ value: "x", label: "Horizontal", icon: "nope" }],
    } as unknown as BitmapRendererSelectFieldSchema;

    render(<RendererFieldControl field={field} value="x" onChange={vi.fn()} />);

    expect(screen.getByRole("button", { name: "Horizontal" })).toHaveTextContent("Horizontal");
  });
});

describe("BitmapRendererSection with a malformed plugin schema", () => {
  /** A manifest that main-process validation would now reject — the panel
   *  still must not go blank if one ever reaches it. */
  const malformed = {
    id: "bad.plugin",
    label: "Bad Plugin",
    apiVersion: 1,
    defaults: {},
    fields: [{ type: "select", key: "axis", label: "Axis", control: "icon-buttons", options: "not-an-array" }],
  } as unknown as BitmapPluginManifest;

  it("contains the failure and keeps the renderer picker usable", () => {
    useBitmapPluginStore.setState({ plugins: [malformed] });
    const imp = createSvgImport({ kind: "bitmap", bitmapRendererId: "bad.plugin", paths: [] });

    render(<BitmapRendererSection imp={imp} onUpdate={vi.fn()} />);

    expect(screen.getByText(/couldn't be displayed/i)).toBeInTheDocument();
    // The control the user needs in order to recover is outside the boundary.
    expect(screen.getByRole("combobox", { name: "Bitmap renderer" })).toBeInTheDocument();
  });
});
