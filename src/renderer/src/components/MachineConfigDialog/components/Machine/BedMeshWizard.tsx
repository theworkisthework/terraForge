import React, { Fragment, useEffect, useState } from "react";
import { AlertTriangle, Check, ChevronLeft, ChevronRight, House, OctagonX } from "lucide-react";
import { createBedMeshInterpolator, MAX_BED_MESH_GRID_POINTS } from "../../../../../../types/bedMesh";
import type { BedMesh } from "../../../../../../types";
import { useModalFocus } from "../../../../hooks/useModalFocus";
import { Button } from "../../../ui";
import { Tooltip } from "../../../Tooltip";
import { JogControls } from "../../../JogControls";
import { ConfirmDialog } from "../../../ConfirmDialog";
import {
  clampGridPoints,
  serpentineIndex,
  type BedMeshWizardStep,
  type useBedMeshCalibration,
} from "./useBedMeshCalibration";

type Calibration = ReturnType<typeof useBedMeshCalibration>;

const STEPS = [
  { id: "grid", title: "Choose the number of calibration points" },
  { id: "origin", title: "Set the home position (origin)" },
  { id: "probe", title: "Probe the bed" },
  { id: "review", title: "Review the mesh" },
] as const;

/**
 * Step-by-step bed mesh calibration: choose the grid, establish X0 Y0
 * (homing for machines with end stops, jog + set zero for machines
 * without), probe each point, then review before saving.
 */
export function BedMeshWizard({ calibration }: { calibration: Calibration }) {
  const { wizardStep, cancel, error, busy, index, goToStep } = calibration;
  const { ref, onKeyDown } = useModalFocus<HTMLDivElement>({
    onEscape: () => void cancel(),
  });
  const currentIndex = STEPS.findIndex((s) => s.id === wizardStep);
  // A step jump that would throw away probing work, waiting on confirmation.
  const [pendingJump, setPendingJump] = useState<BedMeshWizardStep | null>(null);

  const requestStep = (target: BedMeshWizardStep) => {
    const losesWork = (wizardStep === "probe" && index > 0) || wizardStep === "review";
    if (losesWork) setPendingJump(target);
    else void goToStep(target);
  };

  return (
    <div
      ref={ref}
      role="dialog"
      aria-modal="true"
      aria-labelledby="bed-mesh-wizard-title"
      className="fixed inset-0 z-[60] flex items-center justify-center overflow-y-auto p-4 bg-black/60"
      onKeyDown={onKeyDown}
      tabIndex={-1}
    >
      {/* Fixed height (sized for the tallest step, the jog controls) so the
          dialog doesn't resize as the user moves between steps. */}
      <div className="bg-panel border border-border-ui rounded-lg shadow-2xl w-full max-w-[540px] h-[680px] max-h-[calc(100dvh-2rem)] flex flex-col overflow-hidden my-auto">
        <div className="flex items-center justify-between gap-4 px-5 py-4 border-b border-border-ui">
          <h2 id="bed-mesh-wizard-title" className="text-content font-semibold text-base tracking-wide">
            Bed mesh calibration
          </h2>
          <Stepper currentIndex={currentIndex} disabled={busy} onSelect={requestStep} />
        </div>

        <div className="p-5 flex-1 min-h-0 overflow-y-auto flex flex-col gap-4">
          {currentIndex >= 0 && (
            // Pulled tight to the description that opens each step.
            <h3 className="text-content font-semibold text-lg -mb-2.5">
              {currentIndex + 1}. {STEPS[currentIndex].title}
            </h3>
          )}
          {wizardStep === "grid" && <GridStep calibration={calibration} />}
          {wizardStep === "origin" && <OriginStep calibration={calibration} />}
          {wizardStep === "probe" && <ProbeStep calibration={calibration} />}
          {wizardStep === "review" && <ReviewStep calibration={calibration} />}
          {/* Reserved so an error appearing doesn't shove the footer about. */}
          <p role="alert" className="text-xs text-red-300 min-h-4">{error}</p>
        </div>

        <Footer calibration={calibration} />
      </div>
      {/* Rendered inside the wizard overlay so it stacks above the panel. */}
      {pendingJump && (
        <ConfirmDialog
          title={`Go back to step ${STEPS.findIndex((s) => s.id === pendingJump) + 1}?`}
          message={
            wizardStep === "review"
              ? pendingJump === "probe"
                ? "This mesh will be discarded and probing will start again from the first point."
                : "This mesh will be discarded and you'll need to probe the bed again."
              : "The points probed so far will be discarded. The pen will be lifted clear of the bed."
          }
          confirmLabel="Go back"
          onConfirm={() => {
            const target = pendingJump;
            setPendingJump(null);
            void goToStep(target);
          }}
          onCancel={() => setPendingJump(null)}
        />
      )}
    </div>
  );
}

/**
 * Compact numbered circles joined by short lines; the step's name is the
 * content heading. Finished steps are buttons that jump back to them.
 */
function Stepper({
  currentIndex, disabled, onSelect,
}: { currentIndex: number; disabled: boolean; onSelect: (step: BedMeshWizardStep) => void }) {
  return (
    <ol className="flex items-center shrink-0" aria-label="Calibration steps">
      {STEPS.map((s, i) => {
        const done = i < currentIndex;
        const current = i === currentIndex;
        const name = `Step ${i + 1}: ${s.title}`;
        return (
          <Fragment key={s.id}>
            {i > 0 && (
              <li
                aria-hidden="true"
                className={`w-4 h-px mx-1.5 ${i <= currentIndex ? "bg-accent" : "bg-border-ui"}`}
              />
            )}
            <li aria-current={current ? "step" : undefined}>
              <Tooltip text={done ? `Back to ${s.title.toLowerCase()}` : s.title}>
                <button
                  type="button"
                  aria-label={done ? `${name} (done) — go back` : name}
                  onClick={() => onSelect(s.id)}
                  disabled={!done || disabled}
                  className={`w-6 h-6 shrink-0 rounded-full flex items-center justify-center text-[11px] font-semibold transition-colors ${
                    done
                      ? "bg-accent text-white hover:bg-accent-hover disabled:opacity-60"
                      : current
                        ? "bg-panel text-accent ring-2 ring-accent ring-offset-2 ring-offset-panel"
                        : "bg-secondary text-content-faint"
                  } disabled:cursor-default`}
                >
                  {done ? <Check size={13} strokeWidth={3} /> : i + 1}
                </button>
              </Tooltip>
            </li>
          </Fragment>
        );
      })}
    </ol>
  );
}

// ── Steps ─────────────────────────────────────────────────────────────────────

function GridStep({ calibration }: { calibration: Calibration }) {
  const { inputCls, xPoints, yPoints, setXPoints, setYPoints, meshName, setMeshName } = calibration;
  return (
    <>
      <p className="text-sm text-content-muted leading-relaxed">
        At each point, lower the pen until it touches the bed. More calibration points follow an
        uneven bed more closely, but calibration will take longer to probe.
      </p>
      <label className="block text-xs text-content-muted">
        Mesh name
        <input
          aria-label="Bed mesh name"
          type="text"
          value={meshName}
          onChange={(e) => setMeshName(e.currentTarget.value)}
          className={inputCls}
        />
      </label>
      <div className="grid grid-cols-2 gap-3">
        <label className="flex flex-col gap-1 text-xs text-content-muted">
          X points
          <PointCountInput label="X grid points" value={xPoints} onChange={setXPoints} className={inputCls} />
        </label>
        <label className="flex flex-col gap-1 text-xs text-content-muted">
          Y points
          <PointCountInput label="Y grid points" value={yPoints} onChange={setYPoints} className={inputCls} />
        </label>
      </div>
      {/* Takes the remaining height so the preview sits centred in it. */}
      <div className="flex-1 flex flex-col items-center justify-center gap-3">
        <BedPreview calibration={calibration} />
        <p className="text-xs text-content-faint text-center">
        {xPoints * yPoints} points to probe · <span className="text-accent">●</span> first point · + X0 Y0
        </p>
      </div>
    </>
  );
}

/**
 * Grid point count. Clamping happens on blur rather than per keystroke, so
 * the field can be cleared and retyped (clamping "" to 2 then typing 4
 * would otherwise give 24). Valid values update the preview as you type.
 */
function PointCountInput({
  label, value, onChange, className,
}: { label: string; value: number; onChange: (value: number) => void; className: string }) {
  const [draft, setDraft] = useState(String(value));
  useEffect(() => setDraft(String(value)), [value]);
  return (
    <input
      aria-label={label}
      type="number"
      min={2}
      max={MAX_BED_MESH_GRID_POINTS}
      step={1}
      value={draft}
      onChange={(e) => {
        const text = e.target.value;
        setDraft(text);
        const n = Number(text);
        if (text !== "" && Number.isInteger(n) && n >= 2 && n <= MAX_BED_MESH_GRID_POINTS) onChange(n);
      }}
      onBlur={() => {
        const clamped = clampGridPoints(Number(draft));
        setDraft(String(clamped));
        onChange(clamped);
      }}
      className={className}
    />
  );
}

const PREVIEW_MAX_W = 360;
const PREVIEW_MAX_H = 180;
const PREVIEW_PAD = 14; // keeps edge points and the origin label inside the SVG

/**
 * The bed scaled to fit `maxWidth` × `maxHeight`, in the jog pad's
 * orientation. `sx`/`sy` map a fraction across the bed (0..1 from the
 * origin side) to SVG coordinates inside a `pad` margin.
 */
function bedGeometry(
  form: Calibration["form"],
  maxWidth: number,
  maxHeight: number,
  pad: number,
) {
  const bedW = form.bedWidth > 0 ? form.bedWidth : 1;
  const bedH = form.bedHeight > 0 ? form.bedHeight : 1;
  const scale = Math.min(maxWidth / bedW, maxHeight / bedH);
  const w = bedW * scale;
  const h = bedH * scale;
  const invertX = form.origin === "bottom-right" || form.origin === "top-right";
  const invertY = form.origin === "top-left" || form.origin === "top-right";
  return {
    w,
    h,
    sx: (fx: number) => pad + (invertX ? 1 - fx : fx) * w,
    sy: (fy: number) => pad + (invertY ? fy : 1 - fy) * h,
  };
}

/**
 * The bed drawn to scale, in the same orientation as the jog pad, with a
 * dot wherever the pen will probe. Updates as the point counts change.
 */
function BedPreview({
  calibration,
  maxWidth = PREVIEW_MAX_W,
  maxHeight = PREVIEW_MAX_H,
  currentIndex,
  moving = false,
}: {
  calibration: Calibration;
  maxWidth?: number;
  maxHeight?: number;
  /**
   * While probing, the probe step (not grid index — probing runs in an S):
   * points probed before it are done, this one is current.
   */
  currentIndex?: number;
  /** The pen is still travelling to `currentIndex`: pulse a ring around it. */
  moving?: boolean;
}) {
  const { form, xPoints, yPoints } = calibration;
  const { w, h, sx, sy } = bedGeometry(form, maxWidth, maxHeight, PREVIEW_PAD);
  const centre = form.origin === "center";
  const dotR = Math.max(2, Math.min(5, Math.min(w / xPoints, h / yPoints) / 5));

  const targetGrid =
    currentIndex !== undefined && currentIndex < xPoints * yPoints
      ? serpentineIndex(currentIndex, xPoints)
      : null;

  const dots = [];
  for (let r = 0; r < yPoints; r++) {
    for (let c = 0; c < xPoints; c++) {
      const i = r * xPoints + c;
      const step = serpentineIndex(i, xPoints);
      const highlighted = currentIndex === undefined ? i === 0 : step === currentIndex;
      const done = currentIndex !== undefined && step < currentIndex;
      dots.push(
        <circle
          key={i}
          cx={sx(c / (xPoints - 1))}
          cy={sy(r / (yPoints - 1))}
          r={highlighted ? dotR + 1 : dotR}
          className={
            highlighted
              ? "fill-accent"
              : done || currentIndex === undefined
                ? "fill-content-muted"
                : "fill-panel stroke-content-faint"
          }
          strokeWidth={1}
        />,
      );
    }
  }

  // Lines through the inner rows and columns; the bed outline covers the edges.
  const gridLines = [];
  for (let c = 1; c < xPoints - 1; c++) {
    const x = sx(c / (xPoints - 1));
    gridLines.push(<line key={`c${c}`} x1={x} x2={x} y1={PREVIEW_PAD} y2={PREVIEW_PAD + h} />);
  }
  for (let r = 1; r < yPoints - 1; r++) {
    const y = sy(r / (yPoints - 1));
    gridLines.push(<line key={`r${r}`} x1={PREVIEW_PAD} x2={PREVIEW_PAD + w} y1={y} y2={y} />);
  }

  const originX = centre ? sx(0.5) : sx(0);
  const originY = centre ? sy(0.5) : sy(0);

  return (
    <svg
      role="img"
      aria-label={`Bed preview: ${xPoints} by ${yPoints} probe points`}
      width={w + PREVIEW_PAD * 2}
      height={h + PREVIEW_PAD * 2}
      className="mx-auto block shrink-0"
    >
      <rect
        x={PREVIEW_PAD}
        y={PREVIEW_PAD}
        width={w}
        height={h}
        rx={3}
        className="fill-app stroke-border-ui"
        strokeWidth={1}
      />
      <g className="stroke-border-ui" strokeWidth={1}>{gridLines}</g>
      {dots}
      {moving && targetGrid !== null && (
        <TargetRing
          cx={sx((targetGrid % xPoints) / (xPoints - 1))}
          cy={sy(Math.floor(targetGrid / xPoints) / (yPoints - 1))}
          r={dotR + 4}
        />
      )}
      {/* Origin marker, drawn over the dots with arms reaching past them so
          it stays visible when X0 Y0 is also the first point. */}
      <path
        d={`M${originX - 11} ${originY}H${originX + 11}M${originX} ${originY - 11}V${originY + 11}`}
        className="stroke-content"
        strokeWidth={1.5}
      />
    </svg>
  );
}

function OriginStep({ calibration }: { calibration: Calibration }) {
  const { originMethod, setOriginMethod, originReady, busy, home, confirmOrigin } = calibration;

  return (
    <>
      <p className="text-sm text-content-muted leading-relaxed">
        Probing is measured from X0, Y0, so that needs to be set correctly before we can run the
        calibration. Choose automatic or manual.
      </p>
      <div className="grid grid-cols-2 gap-2" role="radiogroup" aria-label="Origin method">
        <MethodCard
          selected={originMethod === "home"}
          onSelect={() => setOriginMethod("home")}
          title="Home Automatically"
          detail="The machine has end stops. Automatically home the machine."
          disabled={busy}
        />
        <MethodCard
          selected={originMethod === "jog"}
          onSelect={() => setOriginMethod("jog")}
          title="Home Manually"
          detail="The machine has no end stops. Manually home the machine using the jog controls."
          disabled={busy}
        />
      </div>

      {originMethod === "home" && (
        <>
          <div className="flex gap-5 items-start">
            {/* Pen controls only: the pen travels to the first point at its
                current height, so it has to be raised clear first. */}
            <JogPanelFrame>
              <JogControls zOnly showHoming={false} />
            </JogPanelFrame>
            <div className="flex flex-col gap-3 text-sm text-content-muted leading-relaxed">
              <ol className="list-decimal pl-4 space-y-2">
                <li>Raise the pen clear of the bed, if it isn't already.</li>
                <li>
                  Press <span className="text-content">Run Homing</span>.
                </li>
                <li>
                  Press <span className="text-content">Next</span>.
                </li>
              </ol>
              {/* Same button as the jog panel's Run Homing. */}
              <Tooltip text="Run the machine homing cycle ($H)" className="self-start">
                <Button
                  variant="secondary"
                  onClick={() => void home()}
                  disabled={busy}
                  loading={busy}
                  icon={<House size={13} />}
                >
                  Run Homing
                </Button>
              </Tooltip>
              <OriginStatus calibration={calibration} ready={originReady} />
            </div>
          </div>
          <HomeCheckPanel calibration={calibration} />
        </>
      )}

      {originMethod === "jog" && (
        <div className="flex gap-5 items-start">
          {/* The real jog panel (pen controls and all), framed like the floating one. */}
          <JogPanelFrame>
            <JogControls onSetZero={confirmOrigin} showHoming={false} />
          </JogPanelFrame>
          <div className="flex flex-col gap-3 text-sm text-content-muted leading-relaxed">
            <ol className="list-decimal pl-4 space-y-2">
              <li>Lift the pen clear of the bed.</li>
              <li>Jog the pen over the bed's origin corner.</li>
              <li>Press <span className="text-content">Set Zero</span>.</li>
            </ol>
            <Button variant="ghost" size="sm" onClick={confirmOrigin} disabled={busy} className="self-start -ml-2">
              X0 Y0 is already set — keep it
            </Button>
            <OriginStatus calibration={calibration} ready={originReady} />
          </div>
        </div>
      )}

      {originMethod === null && <OriginStatus calibration={calibration} ready={originReady} />}
    </>
  );
}

/**
 * After homing, says where X0 Y0 is relative to the homed position. Homing
 * doesn't set X0 Y0; a stale work offset would send the first move
 * somewhere unexpected, so anything but "at home" needs a decision.
 */
function HomeCheckPanel({ calibration }: { calibration: Calibration }) {
  const { homeCheck, busy, setZeroAtHome, confirmOrigin, originReady, setOriginMethod } = calibration;
  if (!homeCheck || busy) return null;

  if (homeCheck.kind === "at-home") {
    return (
      <p className="text-xs text-content-muted flex items-start gap-1.5 self-stretch">
        <Check size={13} className="text-green-400 shrink-0 mt-px" />
        <span>Homed. X0 Y0 is at the home position.</span>
      </p>
    );
  }

  const fmt = (v: number) => `${v >= 0 ? "+" : ""}${v.toFixed(1)}`;
  return (
    <div className="self-stretch rounded border border-amber-600/60 bg-amber-900/20 p-3 text-xs text-content-muted space-y-2">
      <p className="flex items-start gap-1.5">
        <AlertTriangle size={14} className="text-amber-400 shrink-0 mt-px" />
        <span>
          {homeCheck.kind === "offset" ? (
            <>
              Homed, but X0 Y0 is <span className="text-content font-mono">
                X {fmt(homeCheck.dx)}, Y {fmt(homeCheck.dy)} mm
              </span>{" "}
              from the home position. Homing doesn't move X0 Y0, so it may be left over from an
              earlier session. Probing starts there.
            </>
          ) : (
            <>
              Homed, but terraForge couldn't tell where X0 Y0 is (the machine hasn't reported its
              work offset yet). Probing starts at X0 Y0.
            </>
          )}
        </span>
      </p>
      <div className="flex flex-wrap gap-2">
        <Button size="sm" variant="primary" onClick={() => void setZeroAtHome()}>
          Set X0 Y0 at home
        </Button>
        {homeCheck.kind === "offset" && (
          <Button size="sm" variant="secondary" onClick={confirmOrigin} disabled={originReady}>
            {originReady ? "Keeping X0 Y0" : "Keep X0 Y0 where it is"}
          </Button>
        )}
        <Button size="sm" variant="ghost" onClick={() => setOriginMethod("jog")}>
          Home manually instead
        </Button>
      </div>
    </div>
  );
}

function OriginStatus({ calibration, ready }: { calibration: Calibration; ready: boolean }) {
  const { form, busy, originMethod, homeCheck } = calibration;
  const firstX = form.origin === "center" ? -form.bedWidth / 2 : 0;
  const firstY = form.origin === "center" ? -form.bedHeight / 2 : 0;
  let text = "";
  if (busy) text = "Waiting for the machine…";
  else if (ready)
    text = `Origin ready. Next moves the pen at jog speed, at its current height, to the first point (X ${firstX.toFixed(1)}, Y ${firstY.toFixed(1)}).`;
  else if (originMethod === "home") text = homeCheck ? "Choose where X0 Y0 should be." : "Not homed yet.";
  else if (originMethod) text = "X0 Y0 not confirmed yet.";
  return (
    // Fixed height so the status changing never moves the controls above it.
    <p className="text-xs min-h-8 flex items-start gap-1.5 text-content-muted" aria-live="polite">
      {ready && !busy && <Check size={13} className="text-green-400 shrink-0 mt-px" />}
      <span>{text}</span>
    </p>
  );
}

function ProbeStep({ calibration }: { calibration: Calibration }) {
  const {
    points, index, movingTo, atPoint, machineIdle, z, datumZ, busy, recordPoint, moveToPoint, result,
    xPoints,
  } = calibration;
  // `index` counts probe steps; probing runs in an S, so map it to the grid.
  const point = points[serpentineIndex(index, xPoints)];
  const complete = result !== null;
  if (!point && !complete) return null;

  return (
    <>
      <p className="text-sm text-content-muted leading-relaxed">
        {complete ? (
          <>All <span className="text-content font-semibold">{points.length} points</span> probed.</>
        ) : (
          <>
            Point <span className="text-content font-semibold">{index + 1} of {points.length}</span> at
            X {point.x.toFixed(1)}, Y {point.y.toFixed(1)}.
          </>
        )}
      </p>
      <div className="flex gap-5 items-start">
        <JogPanelFrame>
          <JogControls zOnly />
        </JogPanelFrame>
        <div className="flex flex-col gap-3 text-sm text-content-muted leading-relaxed min-w-0">
          {complete ? (
            <p className="flex items-start gap-1.5">
              <Check size={14} className="text-green-400 shrink-0 mt-1" />
              <span>All points probed. Press <span className="text-content">Next</span> to review the mesh.</span>
            </p>
          ) : (
            <>
              <ol className="list-decimal pl-4 space-y-2">
                <li>Lower the pen until it just touches the bed.</li>
                <li>Press <span className="text-content">Record point</span>.</li>
              </ol>
              {atPoint || busy ? (
                <Button
                  variant="primary"
                  size="sm"
                  onClick={() => void recordPoint()}
                  disabled={busy || !machineIdle}
                  className="self-start"
                >
                  Record point
                </Button>
              ) : (
                // The move here was stopped or failed: get there before recording.
                <Button
                  variant="primary"
                  size="sm"
                  onClick={() => void moveToPoint()}
                  disabled={!machineIdle}
                  className="self-start"
                >
                  Move to point {index + 1}
                </Button>
              )}
            </>
          )}
          <p className="text-xs font-mono text-content min-h-4" aria-live="polite">
            {complete ? "" : datumZ === null ? "Sets the reference height" : `Offset ${formatOffset(z)} mm`}
          </p>
          <BedPreview
            calibration={calibration}
            maxWidth={196}
            maxHeight={150}
            currentIndex={movingTo ?? index}
            moving={movingTo !== null}
          />
          <p className="text-xs text-content-faint min-h-4" aria-live="polite">
            {movingTo !== null
              ? `Moving to point ${movingTo + 1}…`
              : busy
                ? "Waiting for the machine…"
                : ""}
          </p>
        </div>
      </div>
    </>
  );
}

/**
 * Marks the point the pen is heading to: a steady ring plus an expanding
 * ripple (dropped under reduced motion). Gone once the machine arrives.
 */
function TargetRing({ cx, cy, r }: { cx: number; cy: number; r: number }) {
  return (
    <g aria-hidden="true" className="pointer-events-none">
      <circle cx={cx} cy={cy} r={r} className="fill-none stroke-accent" strokeWidth={1.5} />
      <circle
        cx={cx}
        cy={cy}
        r={r}
        className="fill-none stroke-accent motion-safe:animate-ping motion-reduce:hidden"
        strokeWidth={1.5}
        style={{ transformBox: "fill-box", transformOrigin: "center" }}
      />
    </g>
  );
}

/** The floating jog panel's frame (border, shadow, grab strip), minus the dragging. */
function JogPanelFrame({ children }: { children: React.ReactNode }) {
  return (
    <div className="shrink-0 bg-panel border border-border-ui rounded-lg shadow-2xl overflow-hidden">
      <div aria-hidden="true" className="h-2.5 w-full bg-secondary/50" />
      <div className="p-4 w-64">{children}</div>
    </div>
  );
}

function ReviewStep({ calibration }: { calibration: Calibration }) {
  const { result } = calibration;
  if (!result) return null;
  const offsets = result.points.map((p) => p.z);
  const range = Math.max(...offsets) - Math.min(...offsets);
  return (
    <>
      <p className="text-sm text-content-muted leading-relaxed">
        All {result.points.length} points probed. The highest and lowest points differ by{" "}
        <span className="text-content font-semibold">{range.toFixed(2)} mm</span>. Offsets are
        relative to the first point; compensation blends between them across the bed.
      </p>
      <MeshHeatMap calibration={calibration} mesh={result} />
    </>
  );
}

const HEAT_PAD = 26; // room for value labels on edge points
const HEAT_COLS = 60; // colour cells across the bed's longer side
const LABEL_MIN_DX = 48; // point spacing needed to label every point
const LABEL_MIN_DY = 26;

/** Colour for t in 0..1 along the theme's mesh ramp (low → high). */
function meshColor(t: number): string {
  const pct = Math.round(Math.min(1, Math.max(0, t)) * 100);
  return `color-mix(in oklab, var(--tf-mesh-high) ${pct}%, var(--tf-mesh-low))`;
}

/**
 * The probed mesh as a heat map on the bed graphic: colour is the
 * interpolated height compensation will apply, with each probe point
 * marked (hover for its value) and labelled when there's room. Dense
 * meshes fall back to the value grid below the map.
 */
function MeshHeatMap({ calibration, mesh }: { calibration: Calibration; mesh: BedMesh }) {
  const { form } = calibration;
  const { xPoints, yPoints } = mesh;
  const { w, h, sx, sy } = bedGeometry(form, 440, 250, HEAT_PAD);
  const interpolate = createBedMeshInterpolator(mesh);
  const zs = mesh.points.map((p) => p.z);
  const min = Math.min(...zs);
  const max = Math.max(...zs);
  const t = (z: number) => (max - min < 1e-6 ? 0.5 : (z - min) / (max - min));
  const xMin = mesh.xMinMM ?? 0;
  const yMin = mesh.yMinMM ?? 0;

  // Cells sized for roughly square pixels at this scale.
  const cols = w >= h ? HEAT_COLS : Math.max(8, Math.round((HEAT_COLS * w) / h));
  const rows = w >= h ? Math.max(8, Math.round((HEAT_COLS * h) / w)) : HEAT_COLS;
  const cells = [];
  if (interpolate) {
    for (let r = 0; r < rows; r++) {
      for (let c = 0; c < cols; c++) {
        const fx = (c + 0.5) / cols;
        const fy = (r + 0.5) / rows;
        const z = interpolate(xMin + fx * mesh.widthMM, yMin + fy * mesh.heightMM);
        const x0 = sx(c / cols);
        const x1 = sx((c + 1) / cols);
        const y0 = sy(r / rows);
        const y1 = sy((r + 1) / rows);
        cells.push(
          <rect
            key={`${r}-${c}`}
            x={Math.min(x0, x1)}
            y={Math.min(y0, y1)}
            // A hair of overlap hides anti-aliasing seams between cells.
            width={Math.abs(x1 - x0) + 0.5}
            height={Math.abs(y1 - y0) + 0.5}
            style={{ fill: meshColor(t(z)) }}
          />,
        );
      }
    }
  }

  const showLabels = w / (xPoints - 1) >= LABEL_MIN_DX && h / (yPoints - 1) >= LABEL_MIN_DY;
  const markers = mesh.points.map((p, i) => {
    const cx = sx((i % xPoints) / (xPoints - 1));
    const cy = sy(Math.floor(i / xPoints) / (yPoints - 1));
    const value = `${formatOffset(p.z)} mm`;
    return (
      <g key={i}>
        <title>{`Point ${i + 1} (X ${p.x.toFixed(1)}, Y ${p.y.toFixed(1)}): ${value}${i === 0 ? " — reference" : ""}`}</title>
        {/* Generous invisible hit area for the hover tooltip. */}
        <circle cx={cx} cy={cy} r={12} fill="transparent" />
        {showLabels ? (
          <>
            <rect
              x={cx - 22}
              y={cy - 9}
              width={44}
              height={18}
              rx={4}
              className={`fill-panel ${i === 0 ? "stroke-content" : "stroke-border-ui"}`}
              strokeWidth={1}
              opacity={0.92}
            />
            <text
              x={cx}
              y={cy}
              textAnchor="middle"
              dominantBaseline="central"
              className="fill-content font-mono text-[10px]"
            >
              {formatOffset(p.z)}
            </text>
          </>
        ) : (
          <circle cx={cx} cy={cy} r={3} className="fill-content stroke-panel" strokeWidth={2} />
        )}
      </g>
    );
  });

  return (
    <div className="flex-1 flex flex-col items-center justify-center gap-3">
      <svg
        role="img"
        aria-label={`Bed mesh heat map: offsets from ${formatOffset(min)} to ${formatOffset(max)} mm`}
        width={w + HEAT_PAD * 2}
        height={h + HEAT_PAD * 2}
        className="block shrink-0"
      >
        <defs>
          <clipPath id="bed-mesh-heat-clip">
            <rect x={HEAT_PAD} y={HEAT_PAD} width={w} height={h} rx={3} />
          </clipPath>
        </defs>
        <g clipPath="url(#bed-mesh-heat-clip)" shapeRendering="crispEdges">{cells}</g>
        <rect
          x={HEAT_PAD}
          y={HEAT_PAD}
          width={w}
          height={h}
          rx={3}
          className="fill-none stroke-border-ui"
          strokeWidth={1}
        />
        {markers}
      </svg>

      {/* Scale legend: ends labelled with the measured extremes. */}
      <div className="flex items-center gap-2 text-xs text-content-muted">
        {/* Not "lower/higher": with inverted Z jog the sign means the opposite. */}
        <span>Z offset</span>
        <span className="font-mono text-content">{formatOffset(min)}</span>
        <span
          aria-hidden="true"
          className="h-2.5 w-40 rounded-full border border-border-ui"
          style={{
            background: "linear-gradient(in oklab to right, var(--tf-mesh-low), var(--tf-mesh-high))",
          }}
        />
        <span className="font-mono text-content">{formatOffset(max)}</span>
        <span>mm</span>
      </div>

      {!showLabels && <PointGrid calibration={calibration} />}
    </div>
  );
}

// ── Shared pieces ─────────────────────────────────────────────────────────────

/**
 * The probe grid laid out as it sits on the bed (same orientation as the
 * jog pad), showing progress while probing and offsets in review.
 */
function PointGrid({ calibration }: { calibration: Calibration }) {
  const { form, points, xPoints, yPoints } = calibration;
  const invertX = form.origin === "bottom-right" || form.origin === "top-right";
  const invertY = form.origin === "top-left" || form.origin === "top-right";
  const rows = Array.from({ length: yPoints }, (_, r) => r);
  const cols = Array.from({ length: xPoints }, (_, c) => c);
  if (!invertY) rows.reverse(); // Y+ is up on screen unless the origin is at the top.
  if (invertX) cols.reverse();

  return (
    <div
      aria-label="Probed offsets"
      className="grid gap-1.5 mx-auto"
      style={{ gridTemplateColumns: `repeat(${xPoints}, minmax(2.75rem, auto))` }}
    >
      {rows.flatMap((r) =>
        cols.map((c) => {
          const i = r * xPoints + c;
          return (
            <div key={i} className="flex items-center justify-center h-4">
              {points[i] && (
                <span className="text-[10px] font-mono text-content-muted text-center">{formatOffset(points[i].z)}</span>
              )}
            </div>
          );
        }),
      )}
    </div>
  );
}

function MethodCard({
  selected, onSelect, title, detail, disabled,
}: { selected: boolean; onSelect: () => void; title: string; detail: string; disabled: boolean }) {
  return (
    <button
      type="button"
      role="radio"
      aria-checked={selected}
      onClick={onSelect}
      disabled={disabled}
      className={`text-left rounded border p-3 transition-colors disabled:opacity-40 ${
        selected ? "border-accent bg-accent/10" : "border-border-ui hover:bg-secondary/40"
      }`}
    >
      <span className="block text-sm text-content font-semibold">{title}</span>
      <span className="block text-xs text-content-faint mt-1">{detail}</span>
    </button>
  );
}

/**
 * Cancel on the left; Back and the step's forward action on the right.
 * Back is always there (disabled when it can't be used) so the buttons
 * don't jump about between steps.
 */
function Footer({ calibration }: { calibration: Calibration }) {
  const {
    wizardStep, busy, cancel, back, confirmGrid, originReady, startProbing, showReview,
    result, saveResult, zCompensationAvailable, stop,
  } = calibration;
  const forward = <ChevronRight size={14} />;
  return (
    <div className="flex gap-2 items-center px-5 py-3 border-t border-border-ui">
      {busy ? (
        // While the wizard has the machine moving, Cancel becomes Stop.
        <Tooltip text="Feed hold, then reset: stops the machine" className="mr-auto">
          <Button variant="danger" onClick={() => void stop()} icon={<OctagonX size={14} />}>
            Stop
          </Button>
        </Tooltip>
      ) : (
        <Button variant="secondary" onClick={() => void cancel()} className="mr-auto">
          {wizardStep === "review" ? "Discard" : "Cancel"}
        </Button>
      )}
      <Button
        variant="ghost"
        onClick={back}
        disabled={busy || wizardStep !== "origin"}
        icon={<ChevronLeft size={14} />}
      >
        Back
      </Button>
      {wizardStep === "grid" && (
        <Button variant="primary" onClick={confirmGrid} data-autofocus>Next{forward}</Button>
      )}
      {wizardStep === "origin" && (
        <Tooltip text={originReady ? "Moves the pen at jog speed, at its current height, to the first probe point" : "Set the home position first"}>
          <Button variant="primary" onClick={() => void startProbing()} disabled={busy || !originReady}>
            Next{forward}
          </Button>
        </Tooltip>
      )}
      {wizardStep === "probe" && (
        <Tooltip text={result ? "Review the probed mesh" : "Record every point first"}>
          <Button variant="primary" onClick={showReview} disabled={busy || !result}>
            Next{forward}
          </Button>
        </Tooltip>
      )}
      {wizardStep === "review" && (
        <>
          <Button variant="secondary" onClick={() => void saveResult(false)}>Save</Button>
          <Button
            variant="primary"
            onClick={() => void saveResult(true)}
            disabled={!zCompensationAvailable}
            data-autofocus
          >
            Save and enable
          </Button>
        </>
      )}
    </div>
  );
}

function formatOffset(value: number): string {
  const rounded = Math.abs(value) < 0.0005 ? 0 : value;
  return `${rounded >= 0 ? "+" : ""}${rounded.toFixed(2)}`;
}
