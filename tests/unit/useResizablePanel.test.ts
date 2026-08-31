import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { renderHook, act } from "@testing-library/react";
import { useResizablePanel } from "@renderer/hooks/useResizablePanel";

describe("useResizablePanel", () => {
  let container: HTMLDivElement;

  beforeEach(() => {
    container = document.createElement("div");
    container.style.height = "900px";
    container.style.display = "block";
    document.body.appendChild(container);
    // jsdom does not compute layout heights, so stub the container size.
    vi.spyOn(container, "clientHeight", "get").mockReturnValue(900);
    vi.spyOn(container, "getBoundingClientRect").mockReturnValue({
      height: 900,
      width: 800,
      top: 0,
      left: 0,
      right: 800,
      bottom: 900,
      x: 0,
      y: 0,
      toJSON: () => {},
    });
    vi.clearAllMocks();
  });

  afterEach(() => {
    document.body.removeChild(container);
  });

  it("starts at the initial height", () => {
    const { result } = renderHook(() => useResizablePanel({ initialHeight: 160 }));
    expect(result.current.height).toBe(160);
    expect(result.current.isDragging).toBe(false);
  });

  it("grows upward when dragging the handle up", () => {
    const { result } = renderHook(() =>
      useResizablePanel({ initialHeight: 160 }),
    );

    // Attach the container ref manually
    act(() => {
      (result.current.containerRef as React.MutableRefObject<HTMLDivElement | null>).current = container;
    });

    act(() => {
      result.current.handleMouseDown({
        clientY: 500,
        preventDefault: vi.fn(),
      } as unknown as React.MouseEvent);
    });

    expect(result.current.isDragging).toBe(true);

    act(() => {
      document.dispatchEvent(new MouseEvent("mousemove", { clientY: 450, bubbles: true }));
    });

    // Dragged 50px up -> height increases by 50
    expect(result.current.height).toBe(210);
  });

  it("shrinks when dragging the handle down", () => {
    const { result } = renderHook(() =>
      useResizablePanel({ initialHeight: 160 }),
    );

    act(() => {
      (result.current.containerRef as React.MutableRefObject<HTMLDivElement | null>).current = container;
    });

    act(() => {
      result.current.handleMouseDown({
        clientY: 500,
        preventDefault: vi.fn(),
      } as unknown as React.MouseEvent);
    });

    act(() => {
      document.dispatchEvent(new MouseEvent("mousemove", { clientY: 550, bubbles: true }));
    });

    expect(result.current.height).toBe(110);
  });

  it("does not exceed two-thirds of the container height", () => {
    const { result } = renderHook(() =>
      useResizablePanel({ initialHeight: 160, maxHeightFraction: 2 / 3 }),
    );

    act(() => {
      (result.current.containerRef as React.MutableRefObject<HTMLDivElement | null>).current = container;
    });

    act(() => {
      result.current.handleMouseDown({
        clientY: 500,
        preventDefault: vi.fn(),
      } as unknown as React.MouseEvent);
    });

    act(() => {
      document.dispatchEvent(new MouseEvent("mousemove", { clientY: 0, bubbles: true }));
    });

    // 2/3 of 900px = 600px
    expect(result.current.height).toBe(600);
  });

  it("does not shrink below the minimum height", () => {
    const { result } = renderHook(() =>
      useResizablePanel({ initialHeight: 160, minHeight: 32 }),
    );

    act(() => {
      (result.current.containerRef as React.MutableRefObject<HTMLDivElement | null>).current = container;
    });

    act(() => {
      result.current.handleMouseDown({
        clientY: 500,
        preventDefault: vi.fn(),
      } as unknown as React.MouseEvent);
    });

    act(() => {
      document.dispatchEvent(new MouseEvent("mousemove", { clientY: 900 }));
    });

    expect(result.current.height).toBe(32);
  });

  it("stops dragging on mouseup", () => {
    const { result } = renderHook(() => useResizablePanel({ initialHeight: 160 }));

    act(() => {
      (result.current.containerRef as React.MutableRefObject<HTMLDivElement | null>).current = container;
    });

    act(() => {
      result.current.handleMouseDown({
        clientY: 500,
        preventDefault: vi.fn(),
      } as unknown as React.MouseEvent);
    });

    act(() => {
      document.dispatchEvent(new MouseEvent("mouseup"));
    });

    expect(result.current.isDragging).toBe(false);
  });

  it("clamps height on window resize", () => {
    const { result } = renderHook(() =>
      useResizablePanel({ initialHeight: 160, maxHeightFraction: 2 / 3 }),
    );

    act(() => {
      (result.current.containerRef as React.MutableRefObject<HTMLDivElement | null>).current = container;
    });

    // Resize container to 600px; 2/3 is 400px, so height should clamp from 160 to 400 (no change)
    container.style.height = "600px";

    act(() => {
      window.dispatchEvent(new Event("resize"));
    });

    expect(result.current.height).toBeLessThanOrEqual(400);
  });
});
