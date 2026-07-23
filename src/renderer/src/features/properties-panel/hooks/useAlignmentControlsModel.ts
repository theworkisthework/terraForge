interface UseAlignmentControlsModelArgs {
  objW: number;
  objH: number;
  bedW: number;
  bedH: number;
  origin?: "bottom-left" | "top-left" | "bottom-right" | "top-right" | "center";
  pageW: number;
  pageH: number;
  marginMM: number;
  canAlignToTemplate: boolean;
  templateAlignEnabled: boolean;
  templateAlignTarget: "page" | "margin";
  onAlignX: (x: number) => void;
  onAlignY: (y: number) => void;
}

const roundToTenth = (value: number) => Math.round(value * 10) / 10;

export function useAlignmentControlsModel({
  objW,
  objH,
  bedW,
  bedH,
  origin = "bottom-left",
  pageW,
  pageH,
  marginMM,
  canAlignToTemplate,
  templateAlignEnabled,
  templateAlignTarget,
  onAlignX,
  onAlignY,
}: UseAlignmentControlsModelArgs) {
  const useTemplateBounds = templateAlignEnabled && canAlignToTemplate;
  const inset = useTemplateBounds
    ? templateAlignTarget === "margin"
      ? Math.min(Math.max(marginMM, 0), pageW / 2, pageH / 2)
      : 0
    : 0;
  const minX = useTemplateBounds ? inset : 0;
  const maxX = useTemplateBounds ? pageW - inset : bedW;
  const minY = useTemplateBounds ? inset : 0;
  const maxY = useTemplateBounds ? pageH - inset : bedH;
  const isTopOrigin = origin === "top-left" || origin === "top-right";

  const frameName = useTemplateBounds
    ? templateAlignTarget === "margin"
      ? "margin"
      : "page"
    : "bed";

  const centerX = minX + (maxX - minX - objW) / 2;
  const rightX = maxX - objW;
  // Top-origin modes render import Y with the top edge at (y + objH), so
  // top/bottom/centre alignment targets must account for that offset.
  const topY = isTopOrigin ? minY - objH : maxY - objH;
  const bottomY = isTopOrigin ? maxY - objH * 2 : minY;
  const centerY = (topY + bottomY) / 2;

  return {
    leftTitle: useTemplateBounds
      ? `Align left edge to ${frameName} left (X = ${roundToTenth(minX)})`
      : "Align left edge to bed left (X = 0)",
    centerHTitle: useTemplateBounds
      ? `Centre horizontally (${frameName}) (X = ${roundToTenth(centerX)} mm)`
      : `Centre horizontally (X = ${roundToTenth((bedW - objW) / 2)} mm)`,
    rightTitle: useTemplateBounds
      ? `Align right edge to ${frameName} right (X = ${roundToTenth(rightX)} mm)`
      : `Align right edge to bed right (X = ${roundToTenth(bedW - objW)} mm)`,
    topTitle: useTemplateBounds
      ? `Align top edge to ${frameName} top (Y = ${roundToTenth(topY)} mm)`
      : `Align top edge to bed top (Y = ${roundToTenth(bedH - objH)} mm)`,
    centerVTitle: useTemplateBounds
      ? `Centre vertically (${frameName}) (Y = ${roundToTenth(centerY)} mm)`
      : `Centre vertically (Y = ${roundToTenth((bedH - objH) / 2)} mm)`,
    bottomTitle: useTemplateBounds
      ? `Align bottom edge to ${frameName} bottom (Y = ${roundToTenth(bottomY)} mm)`
      : "Align bottom edge to bed bottom (Y = 0)",
    targetControlDisabled: !templateAlignEnabled || !canAlignToTemplate,
    targetControlToneClass:
      templateAlignEnabled && canAlignToTemplate
        ? "text-content-muted"
        : "text-content-faint",
    onAlignLeft: () => onAlignX(minX),
    onAlignCenterX: () => onAlignX(centerX),
    onAlignRight: () => onAlignX(rightX),
    onAlignTop: () => onAlignY(topY),
    onAlignCenterY: () => onAlignY(centerY),
    onAlignBottom: () => onAlignY(bottomY),
  };
}
