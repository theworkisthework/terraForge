// The canvas is written for a mouse: object drag / scale / rotate listen for
// mousedown + window mousemove/mouseup, pan is middle-button (or Space) drag,
// and zoom is the wheel. Touch screens only fire those compatibility events
// for taps, not drags, so this bridge translates touch gestures on the canvas
// into the equivalent synthetic mouse/wheel events instead of forking every
// gesture hook:
//
//   one finger on an object/handle   → left-button drag (move/scale/rotate)
//   one finger on empty canvas       → pan (synthetic middle-button drag)
//   two fingers                      → pinch zoom (wheel) + pan
//   quick tap                        → click (selection / deselection)

const TAP_SLOP_PX = 10;
const TAP_MAX_MS = 350;
const WHEEL_STEP = 1.1; // must match useCanvasPanZoom

type Pt = { x: number; y: number };

function mouse(
  type: string,
  p: Pt,
  button: number,
  buttons: number,
): MouseEvent {
  return new MouseEvent(type, {
    bubbles: true,
    cancelable: true,
    view: window,
    clientX: p.x,
    clientY: p.y,
    button,
    buttons,
  });
}

const centre = (a: Touch, b: Touch): Pt => ({
  x: (a.clientX + b.clientX) / 2,
  y: (a.clientY + b.clientY) / 2,
});
const dist = (a: Touch, b: Touch) =>
  Math.hypot(a.clientX - b.clientX, a.clientY - b.clientY);

/** True for elements that should keep native touch behaviour (taps on buttons etc). */
function isNativeControl(el: Element | null): boolean {
  return !!el?.closest("button, a, input, select, textarea, [role=button]");
}

/** Background = nothing on the canvas reacts to the press, so use it to pan. */
function isBackground(el: Element): boolean {
  const cursor = getComputedStyle(el).cursor;
  return cursor === "auto" || cursor === "default";
}

type Mode = "none" | "object" | "pan" | "pinch";

export function installTouchBridge(): () => void {
  let mode: Mode = "none";
  let target: Element | null = null;
  let start: Pt = { x: 0, y: 0 };
  let startTime = 0;
  let moved = false;
  let last: Pt = { x: 0, y: 0 };
  let pinchDist = 0;
  let wheelRemainder = 0;
  let container: Element | null = null;

  const endGesture = () => {
    if (mode === "object" || mode === "pan" || mode === "pinch") {
      window.dispatchEvent(mouse("mouseup", last, mode === "object" ? 0 : 1, 0));
    }
    mode = "none";
    target = null;
  };

  const onStart = (e: TouchEvent) => {
    const el = (e.target as Element | null) ?? null;
    const canvas = el?.closest("[data-plot-canvas]") ?? null;
    if (e.touches.length === 1) {
      if (!canvas || isNativeControl(el)) return;
      container = canvas;
      const t = e.touches[0];
      start = last = { x: t.clientX, y: t.clientY };
      startTime = Date.now();
      moved = false;
      target = el;
      const bg = isBackground(el!);
      mode = bg ? "pan" : "object";
      e.preventDefault();
      (el as Element).dispatchEvent(
        mouse("mousedown", start, bg ? 1 : 0, bg ? 4 : 1),
      );
    } else if (e.touches.length === 2 && (canvas || container)) {
      // Upgrade to a two-finger gesture: drop any one-finger drag first.
      endGesture();
      const [a, b] = [e.touches[0], e.touches[1]];
      const c = centre(a, b);
      last = c;
      pinchDist = dist(a, b);
      wheelRemainder = 0;
      mode = "pinch";
      moved = true; // never counts as a tap
      e.preventDefault();
      (container ?? canvas)!.dispatchEvent(mouse("mousedown", c, 1, 4));
    }
  };

  const onMove = (e: TouchEvent) => {
    if (mode === "none") return;
    e.preventDefault();
    if (mode === "pinch" && e.touches.length >= 2) {
      const [a, b] = [e.touches[0], e.touches[1]];
      const c = centre(a, b);
      last = c;
      window.dispatchEvent(mouse("mousemove", c, 1, 4));
      const d = dist(a, b);
      if (pinchDist > 0 && d > 0) {
        wheelRemainder += Math.log(d / pinchDist) / Math.log(WHEEL_STEP);
        pinchDist = d;
        const steps = Math.trunc(wheelRemainder);
        wheelRemainder -= steps;
        for (let i = 0; i < Math.abs(steps); i++) {
          (container ?? document.body).dispatchEvent(
            new WheelEvent("wheel", {
              bubbles: true,
              cancelable: true,
              clientX: c.x,
              clientY: c.y,
              deltaY: steps > 0 ? -100 : 100,
            }),
          );
        }
      }
      return;
    }
    if (e.touches.length === 1 && (mode === "object" || mode === "pan")) {
      const t = e.touches[0];
      last = { x: t.clientX, y: t.clientY };
      if (Math.hypot(last.x - start.x, last.y - start.y) > TAP_SLOP_PX)
        moved = true;
      window.dispatchEvent(
        mouse("mousemove", last, mode === "object" ? 0 : 1, mode === "object" ? 1 : 4),
      );
    }
  };

  const onEnd = (e: TouchEvent) => {
    if (mode === "none") return;
    e.preventDefault();
    const wasTap =
      !moved && Date.now() - startTime < TAP_MAX_MS && mode !== "pinch";
    const el = target;
    // Lifting one finger of a pinch ends the gesture; remaining finger is ignored
    // until it lifts too (avoids a jump from pinch into pan).
    if (mode === "pinch" && e.touches.length > 0) {
      window.dispatchEvent(mouse("mouseup", last, 1, 0));
      mode = "none";
      return;
    }
    endGesture();
    if (wasTap && el) el.dispatchEvent(mouse("click", last, 0, 0));
  };

  const opts = { passive: false, capture: true } as const;
  document.addEventListener("touchstart", onStart, opts);
  document.addEventListener("touchmove", onMove, opts);
  document.addEventListener("touchend", onEnd, opts);
  document.addEventListener("touchcancel", onEnd, opts);
  return () => {
    document.removeEventListener("touchstart", onStart, opts);
    document.removeEventListener("touchmove", onMove, opts);
    document.removeEventListener("touchend", onEnd, opts);
    document.removeEventListener("touchcancel", onEnd, opts);
  };
}
