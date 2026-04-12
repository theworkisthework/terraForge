import { describe, expect, it } from "vitest";
import {
  findContainingLayerId,
  getEffectiveFill,
  getLayerName,
  hasVisibleStroke,
  isDisplayNone,
  isLayerGroup,
  parseSvgLengthMM,
  parseSvgStylesheet,
  shapeToPathD,
} from "./svgImportHelpers";
import {
  applyMatrixToPathD,
  computePathsBounds,
  getAccumulatedTransform,
} from "../../../utils/svgTransform";
import { generateHatchPaths } from "../../../utils/hatchFill";

const ILLUSTRATOR_SAMPLE_SVG = `
<svg xmlns="http://www.w3.org/2000/svg" version="1.1" viewBox="0 0 1190.55 841.89">
  <defs>
    <style>
      .st0 { stroke: #9d4c97; }
      .st0, .st1 { fill: none; }
      .st0, .st1, .st2 { stroke-miterlimit: 10; stroke-width: .03px; }
      .st1 { stroke: #e6007e; }
      .st2 { fill: #fff; stroke: #010101; }
    </style>
  </defs>
  <g id="Cut_2">
    <path class="st0" d="M566.65,678.35c-1.73,0-3.44-.46-4.95-1.32l-55.4-31.88c-18.2-10.5-35.05-27.2-45.06-44.68-9.87-17.28-15.31-38.49-15.31-59.75v-121.42c0-.34-.18-.65-.47-.82l-49.95-28.74c-3.07-1.77-4.97-5.06-4.97-8.6,0,0,0-64.16,0-64.18,0-.06.03-.62.04-.64,0-.05.1-.8.11-.81,0-.04.09-.46.09-.46.01-.05.04-.16.04-.16.03-.14.06-.26.1-.38,0,0,.15-.49.15-.5.02-.05.03-.09.05-.13,0,0,.07-.2.09-.24.44-1.17,1.12-2.26,2-3.21.02-.02.37-.38.38-.39.03-.03.43-.39.43-.39.04-.04.32-.26.34-.28.31-.25.71-.52,1.13-.76.04-.02,44.89-25.83,49.99-28.77.29-.17.47-.48.47-.82v-57.94c-.02-1.71.4-3.4,1.23-4.9.01-.02.2-.35.23-.39.88-1.45,2.13-2.64,3.6-3.47l27.51-15.88c.18-.1.36-.2.54-.29l81.81-47.18c.54-.39,1.12-.73,1.73-1l25.83-14.9c.55-.4,1.15-.74,1.78-1.03l40.7-23.47c5.73-3.29,12.23-5.03,18.82-5.03s13.1,1.75,18.75,5.06l55.33,31.84c11.77,6.89,18.77,19.03,18.77,32.51v175.91c0,11.66-2.94,22.62-8.73,32.59-5.49,9.61-13.71,17.84-23.75,23.77l-109.35,63.12s-.08.05-.12.08c-.44.37-.92.7-1.42.99l-22.17,12.8c-.29.17-.47.48-.47.82v25.22c0,16.27,8.76,31.45,22.85,39.62l27.59,15.93c3.06,1.77,4.96,5.06,4.96,8.59v64.14c0,3.54-1.91,6.83-4.97,8.6l-55.39,31.87c-.12.07-.25.14-.37.2-.05.03-.34.17-.34.17-.07.03-.36.16-.37.17-.06.03-.68.26-.69.26-.04.01-.29.09-.31.1-.14.04-.28.08-.42.12-.03,0-.06.01-.08.02-.78.19-1.58.29-2.38.29Z"/>
    <path class="st2" d="M610.64,270.77c.57-.33,1.29.08,1.29.74v13.43c0,8.02-2.07,15.75-5.99,22.33-.22.38-.42.77-.6,1.18-3.82,6.34-9.3,11.7-15.87,15.52l-12.9,7.44v-40.2c0-.34.18-.65.47-.82l33.6-19.62Z"/>
  </g>
  <g id="Cut_1">
    <path class="st1" d="M720.97,145.38l-55.37-31.86c-9.75-5.71-21.96-5.71-31.87-.01l-41,23.64c-.42.16-.81.38-1.16.67l-26.45,15.25c-.41.16-.79.38-1.13.65l-82.29,47.46c-.12.06-.24.12-.36.18l-27.54,15.9c-.63.35-1.18.87-1.58,1.53h0s0,0,0,0c0,0,0,0,0,.01h0s-.04.06-.05.09c0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,.01t0,0c-.37.67-.54,1.41-.53,2.13v61.8l-53.25,30.64s-.02,0-.02.01c-.18.11-.36.22-.52.35,0,0,0,0,0,0,0,0,0,0-.01.01h0s0,0-.01.01c0,0,0,0,0,0,0,0,0,0-.01,0,0,0,0,0,0,0,0,0,0,0-.01,0h0s0,0-.01.01c0,0,0,0,0,0,0,0,0,0-.01,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0h0s0,0,0,.01c0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0s0,0,0,0c0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0h0s0,0,0,.01h0s0,0,0,.01c0,0,0,0,0,0h0s0,.01,0,.01c0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0-.01,0h0s0,0-.01.01h0s0,0-.01.01h0s0,0-.01.01h0s0,0-.01.01c0,0,0,0,0,0,0,0,0,0-.01.01t0,0h-.01s0,.01,0,.01c0,0,0,0-.01.01h0s0,0-.01.01h0l-.02.02c-.38.41-.67.88-.87,1.4h0s-.02.04-.02.06c0,.01,0,.02-.01.03v.02s0,.01-.01.02t0,0s0,.01,0,.02h0s0,.01,0,.02h0s0,.01,0,.02c0,0,0,0,0,0,0,0,0,.01,0,.02,0,0,0,0,0,0,0,0,0,0,0,.01h0s0,.01,0,.02c0,0,0,0,0,0,0,0,0,.01,0,.01,0,0,0,0,0,0,0,0,0,0,0,.01,0,0,0,0,0,0h0s0,.02,0,.02c0,0,0,.01,0,.02,0,0,0,0,0,0h0s0,.02,0,.02h0s0,.02,0,.02c0,0,0,0,0,.01,0,0,0,0,0,0,0,0,0,0,0,.01,0,0,0,0,0,0h0s0,.02,0,.02c0,0,0,0,0,.01,0,0,0,0,0,0,0,0,0,0,0,.01,0,0,0,0,0,0,0,0,0,0,0,.01,0,0,0,0,0,0,0,0,0,0,0,.01,0,0,0,0,0,0,0,0,0,0,0,.01,0,0,0,0,0,0h0s0,.02,0,.02c0,0,0,0,0,.01,0,0,0,0,0,0,0,0,0,0,0,.01,0,0,0,0,0,0,0,0,0,0,0,.01,0,0,0,0,0,0,0,0,0,0,0,.01,0,0,0,0,0,0,0,0,0,0,0,.01,0,0,0,0,0,0,0,0,0,0,0,.01,0,0,0,0,0,0,0,0,0,0,0,.01,0,0,0,0,0,0,0,0,0,0,0,.01,0,0,0,0,0,0,0,0,0,0,0,.01,0,0,0,0,0,0,0,0,0,0,0,.01,0,0,0,0,0,0,0,0,0,0,0,.01,0,0,0,0,0,0,0,0,0,0,0,.01,0,0,0,0,0,0,0,0,0,0,0,.01,0,0,0,0,0,0,0,0,0,0,0,.01,0,0,0,0,0,0,0,0,0,0,0,.01,0,0,0,0,0,0,0,0,0,0,0,.01,0,0,0,0,0,0,0,0,0,0,0,.01,0,0,0,0,0,0,0,0,0,0,0,.01,0,0,0,0,0,0,0,0,0,0,0,.01,0,0,0,0,0,0,0,0,0,0,0,.01,0,0,0,0,0,0,0,0,0,0,0,.01,0,0,0,0,0,0h0s0,.02,0,.02c0,0,0,0,0,.01,0,0,0,0,0,0s0,0,0,0c0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0h0s0,.01,0,.02c0,0,0,0,0,.01,0,0,0,0,0,0,0,0,0,0,0,.01,0,0,0,0,0,0h0s0,.02,0,.02c0,0,0,0,0,.01,0,0,0,0,0,0,0,0,0,0,0,.01,0,0,0,0,0,0,0,0,0,0,0,.01,0,0,0,0,0,0,0,0,0,0,0,.01,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,.01,0,0,0,0,0,0,0,0,0,0,0,.01,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,.01h0s0,.01,0,.02h0s0,.01,0,.02h0s0,.01,0,.01h0s0,.01,0,.02c0,0,0,0,0,0,0,0,0,0,0,.01h0s0,.01,0,.02c0,0,0,0,0,.01h0s0,.01,0,.02c0,0,0,0,0,0,0,0,0,.02,0,.03,0,0,0,0,0,0h0v.02s0,0,0,0h0v.02s0,.04,0,.05v63.95c0,1.52.81,2.93,2.13,3.69l51.69,29.74c.98.56,1.58,1.6,1.58,2.73v123.43c0,20.28,5.17,40.5,14.56,56.93,9.54,16.64,25.6,32.56,42.97,42.58l55.4,31.88c.66.38,1.39.57,2.12.57.35,0,.7-.04,1.04-.13,0,0,.01,0,.02,0,0,0,.01,0,.02,0,0,0,.01,0,.02,0h0s.01,0,.02,0h0s.02,0,.02,0c0,0,0,0,.01,0,0,0,.01,0,.02,0,0,0,.01,0,.02,0,0,0,.01,0,.02,0s.01,0,.02,0c0,0,.01,0,.02,0,0,0,0,0,0,0,0,0,.01,0,.02,0,0,0,.01,0,.02,0,0,0,0,0,.01,0,0,0,.01,0,.02,0,0,0,0,0,0,0,0,0,0,0,.01,0,0,0,.01,0,.02,0,0,0,0,0,0,0,0,0,0,0,.01,0,0,0,.01,0,.02,0,0,0,.01,0,.02,0,0,0,0,0,0,0,0,0,.01,0,.02,0,0,0,.01,0,.02,0,0,0,.01,0,.02,0,0,0,.01,0,.02,0,0,0,.01,0,.02,0,0,0,.01,0,.02,0,0,0,.01,0,.02,0,0,0,0,0,0,0,0,0,.01,0,.02,0,0,0,.01,0,.02,0,0,0,0,0,.02,0,0,0,.01,0,.02,0,0,0,0,0,0,0,0,0,0,0,.02,0,0,0,.01,0,.02,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,.01,0,0,0,0,0,0,0,0,0,0,0,.01,0,0,0,0,0,0,0,0,0,0,0,.01,0,0,0,0,0,0,0,0,0,0,0,.01,0,0,0,0,0,0,0,0,0,.01,0,.02,0h.01s0,0,0,0h.01s0,0,0,0c0,0,0,0,.01,0,0,0,0,0,0,0,0,0,0,0,.01,0,0,0,0,0,0,0,0,0,0,0,.01,0,0,0,0,0,0,0,0,0,0,0,.01,0,0,0,0,0,0,0,0,0,0,0,.01,0,0,0,0,0,0,0,0,0,0,0,.01,0,0,0,0,0,0,0,0,0,0,0,.01,0,0,0,0,0,0,0,0,0,0,0,.01,0,0,0,0,0,0,0,0,0,0,0,.01,0h0s0,0,.01,0h0s0,0,.01,0h0s0,0,.01,0h0s0,0,.02,0c.06-.03.12-.06.18-.1l55.39-31.87c1.32-.76,2.13-2.16,2.13-3.69v-64.14c0-1.52-.81-2.92-2.13-3.68l-27.6-15.93c-15.84-9.18-25.68-26.24-25.68-44.53v-29.03l25.48-14.71c.35-.2.66-.45.93-.73l109.9-63.44c9.19-5.43,16.71-12.96,21.73-21.74,5.28-9.09,7.96-19.09,7.96-29.74v-175.91c0-11.44-5.95-21.75-15.93-27.59Z"/>
  </g>
</svg>
`;

function firstMatch(svg: string, selector: string): Element {
  const doc = new DOMParser().parseFromString(svg, "image/svg+xml");
  const el = doc.querySelector(selector);
  if (!el) throw new Error(`Missing selector: ${selector}`);
  return el;
}

describe("svgImportHelpers", () => {
  it("parses SVG lengths to mm", () => {
    expect(parseSvgLengthMM("25mm")).toBe(25);
    expect(parseSvgLengthMM("2.54cm")).toBeCloseTo(25.4, 6);
    expect(parseSvgLengthMM("1in")).toBeCloseTo(25.4, 6);
    expect(parseSvgLengthMM("72pt")).toBeCloseTo(25.4, 6);
    expect(parseSvgLengthMM("6pc")).toBeCloseTo(25.4, 6);
    expect(parseSvgLengthMM("96")).toBeCloseTo(25.4, 6);
    expect(parseSvgLengthMM(undefined)).toBeNull();
    expect(parseSvgLengthMM("abc")).toBeNull();
    expect(parseSvgLengthMM("100%")).toBeNull();
  });

  it("detects layer groups by display style or Inkscape marker", () => {
    const withDisplay = firstMatch(
      '<svg><g id="a" style="display:none"><path d="M0,0"/></g></svg>',
      "g#a",
    );
    const withMarker = firstMatch(
      '<svg xmlns:inkscape="http://www.inkscape.org/namespaces/inkscape"><g id="b" inkscape:groupmode="layer"/></svg>',
      "g#b",
    );

    expect(isLayerGroup(withDisplay)).toBe(true);
    expect(isLayerGroup(withMarker)).toBe(true);
    expect(isDisplayNone(withDisplay)).toBe(true);

    const plainGroup = firstMatch('<svg><g id="plain"/></svg>', "g#plain");
    const attrHidden = firstMatch(
      '<svg><g id="h" display="none"/></svg>',
      "g#h",
    );
    expect(isLayerGroup(plainGroup)).toBe(false);
    expect(isDisplayNone(attrHidden)).toBe(true);
  });

  it("resolves layer names and containing layer ids", () => {
    const layer = firstMatch(
      '<svg xmlns:inkscape="http://www.inkscape.org/namespaces/inkscape"><g id="layer-1" inkscape:label="Cut Layer"><path id="p" d="M0,0"/></g></svg>',
      "g#layer-1",
    );
    const path = firstMatch(
      '<svg xmlns:inkscape="http://www.inkscape.org/namespaces/inkscape"><g id="layer-1" inkscape:label="Cut Layer"><path id="p" d="M0,0"/></g></svg>',
      "path#p",
    );

    expect(getLayerName(layer, 0)).toBe("Cut Layer");
    expect(findContainingLayerId(path, new Set(["layer-1"]))).toBe("layer-1");

    const idNamed = firstMatch('<svg><g id="id-name"/></svg>', "g#id-name");
    const classNamed = firstMatch('<svg><g class="class-name"/></svg>', "g");
    const fallbackNamed = firstMatch("<svg><g/></svg>", "g");
    const orphanPath = firstMatch(
      '<svg><g><path id="orphan" d="M0,0"/></g></svg>',
      "path#orphan",
    );

    expect(getLayerName(idNamed, 3)).toBe("id-name");
    expect(getLayerName(classNamed, 4)).toBe("class-name");
    expect(getLayerName(fallbackNamed, 4)).toBe("Layer 5");
    expect(
      findContainingLayerId(orphanPath, new Set(["layer-1"])),
    ).toBeUndefined();
  });

  it("detects inherited fill and stroke visibility", () => {
    const filledPath = firstMatch(
      '<svg><g fill="#111"><path id="p" d="M0,0 L10,0"/></g></svg>',
      "path#p",
    );
    const hiddenStrokePath = firstMatch(
      '<svg><g stroke="#111" stroke-width="0"><path id="s" d="M0,0 L10,0"/></g></svg>',
      "path#s",
    );

    expect(getEffectiveFill(filledPath)).toBe("#111");
    expect(hasVisibleStroke(hiddenStrokePath)).toBe(false);

    const noFill = firstMatch(
      '<svg><path id="n" d="M0,0" fill="none"/></svg>',
      "path#n",
    );
    const transparentFill = firstMatch(
      '<svg><path id="t" d="M0,0" fill="transparent"/></svg>',
      "path#t",
    );
    const urlFill = firstMatch(
      '<svg><path id="u" d="M0,0" fill="url(#grad)"/></svg>',
      "path#u",
    );
    const fillOpacityZero = firstMatch(
      '<svg><path id="fo" d="M0,0" fill="#111" fill-opacity="0"/></svg>',
      "path#fo",
    );
    const opacityZeroFill = firstMatch(
      '<svg><path id="of" d="M0,0" fill="#111" opacity="0"/></svg>',
      "path#of",
    );
    const styleInheritedFill = firstMatch(
      '<svg><g style="fill:#0f0"><path id="sf" d="M0,0 L10,0"/></g></svg>',
      "path#sf",
    );

    expect(getEffectiveFill(noFill)).toBeNull();
    expect(getEffectiveFill(transparentFill)).toBeNull();
    expect(getEffectiveFill(urlFill)).toBeNull();
    expect(getEffectiveFill(fillOpacityZero)).toBeNull();
    expect(getEffectiveFill(opacityZeroFill)).toBeNull();
    expect(getEffectiveFill(styleInheritedFill)).toBe("#0f0");

    const visibleStroke = firstMatch(
      '<svg><path id="vs" d="M0,0" stroke="#222"/></svg>',
      "path#vs",
    );
    const noneStroke = firstMatch(
      '<svg><path id="ns" d="M0,0" stroke="none"/></svg>',
      "path#ns",
    );
    const transparentStroke = firstMatch(
      '<svg><path id="ts" d="M0,0" stroke="transparent"/></svg>',
      "path#ts",
    );
    const strokeOpacityZero = firstMatch(
      '<svg><path id="so" d="M0,0" stroke="#222" stroke-opacity="0"/></svg>',
      "path#so",
    );
    const opacityZeroStroke = firstMatch(
      '<svg><path id="os" d="M0,0" stroke="#222" opacity="0"/></svg>',
      "path#os",
    );

    expect(hasVisibleStroke(visibleStroke)).toBe(true);
    expect(hasVisibleStroke(noneStroke)).toBe(false);
    expect(hasVisibleStroke(transparentStroke)).toBe(false);
    expect(hasVisibleStroke(strokeOpacityZero)).toBe(false);
    expect(hasVisibleStroke(opacityZeroStroke)).toBe(false);
  });

  it("resolves class-based style rules from style blocks", () => {
    const svg = `
      <svg>
        <defs>
          <style>
            .st0 { stroke: #9d4c97; fill: none; stroke-width: .03px; }
            .st1 { stroke: #e6007e; fill: none; stroke-width: .03px; }
            .st2 { fill: #fff; stroke: #010101; stroke-width: .03px; }
            #special { stroke: #111111; }
            .override-me { stroke: none; }
            path { opacity: 1; }
          </style>
        </defs>
        <path id="a" class="st0" d="M0,0 L10,0" />
        <path id="b" class="st2" d="M0,0 L10,0" />
        <path id="special" class="override-me" d="M0,0 L10,0" />
      </svg>
    `;
    const doc = new DOMParser().parseFromString(svg, "image/svg+xml");
    const stylesheet = parseSvgStylesheet(doc);
    const a = doc.querySelector("#a");
    const b = doc.querySelector("#b");
    const special = doc.querySelector("#special");
    if (!a || !b || !special) throw new Error("Expected test paths");

    expect(hasVisibleStroke(a, stylesheet)).toBe(true);
    expect(getEffectiveFill(a, stylesheet)).toBeNull();

    expect(hasVisibleStroke(b, stylesheet)).toBe(true);
    expect(getEffectiveFill(b, stylesheet)).toBe("#fff");

    // ID selector should override class selector for equal property.
    expect(hasVisibleStroke(special, stylesheet)).toBe(true);
  });

  it("keeps inline style precedence over class-based style rules", () => {
    const svg = `
      <svg>
        <defs>
          <style>
            .st0 { stroke: #9d4c97; fill: #0f0; }
          </style>
        </defs>
        <path id="p" class="st0" style="stroke:none; fill:none" d="M0,0 L10,0" />
      </svg>
    `;
    const doc = new DOMParser().parseFromString(svg, "image/svg+xml");
    const stylesheet = parseSvgStylesheet(doc);
    const path = doc.querySelector("#p");
    if (!path) throw new Error("Expected test path");

    expect(hasVisibleStroke(path, stylesheet)).toBe(false);
    expect(getEffectiveFill(path, stylesheet)).toBeNull();
  });

  it("detects display none from class rules", () => {
    const svg = `
      <svg>
        <defs>
          <style>
            .hidden { display: none; }
          </style>
        </defs>
        <g id="grp" class="hidden"><path d="M0,0 L10,0" /></g>
      </svg>
    `;
    const doc = new DOMParser().parseFromString(svg, "image/svg+xml");
    const stylesheet = parseSvgStylesheet(doc);
    const group = doc.querySelector("#grp");
    if (!group) throw new Error("Expected test group");

    expect(isDisplayNone(group, stylesheet)).toBe(true);
  });

  it("converts primitive shapes to path d", () => {
    const line = firstMatch(
      '<svg><line x1="1" y1="2" x2="3" y2="4"/></svg>',
      "line",
    );
    const poly = firstMatch(
      '<svg><polygon points="0,0 10,0 10,10"/></svg>',
      "polygon",
    );
    const roundedRect = firstMatch(
      '<svg><rect x="1" y="2" width="10" height="6" rx="2" ry="2"/></svg>',
      "rect",
    );
    const plainRect = firstMatch(
      '<svg><rect x="1" y="2" width="10" height="6"/></svg>',
      "rect",
    );
    const circle = firstMatch(
      '<svg><circle cx="5" cy="6" r="3"/></svg>',
      "circle",
    );
    const ellipse = firstMatch(
      '<svg><ellipse cx="5" cy="6" rx="4" ry="2"/></svg>',
      "ellipse",
    );
    const polyline = firstMatch(
      '<svg><polyline points="0,0 10,0 10,10"/></svg>',
      "polyline",
    );
    const directPath = firstMatch('<svg><path d="M0,0 L1,1"/></svg>', "path");
    const pathNoD = firstMatch("<svg><path/></svg>", "path");
    const shortPolyline = firstMatch(
      '<svg><polyline points="0"/></svg>',
      "polyline",
    );
    const noPointsPolyline = firstMatch("<svg><polyline/></svg>", "polyline");
    const shortPoly = firstMatch('<svg><polygon points="0"/></svg>', "polygon");
    const noPointsPoly = firstMatch("<svg><polygon/></svg>", "polygon");
    const unsupported = firstMatch('<svg><g id="u"/></svg>', "g#u");

    expect(shapeToPathD(line)).toBe("M1,2 L3,4");
    expect(shapeToPathD(poly)).toBe("M0,0 L10,0 L10,10 Z");
    expect(shapeToPathD(roundedRect)).toContain("A2,2");
    expect(shapeToPathD(plainRect)).toBe("M1,2 H11 V8 H1 Z");
    expect(shapeToPathD(circle)).toContain("A3,3");
    expect(shapeToPathD(ellipse)).toContain("A4,2");
    expect(shapeToPathD(polyline)).toBe("M0,0 L10,0 L10,10");
    expect(shapeToPathD(directPath)).toBe("M0,0 L1,1");
    expect(shapeToPathD(pathNoD)).toBe("");
    expect(shapeToPathD(shortPolyline)).toBe("");
    expect(shapeToPathD(noPointsPolyline)).toBe("");
    expect(shapeToPathD(shortPoly)).toBe("");
    expect(shapeToPathD(noPointsPoly)).toBe("");
    expect(shapeToPathD(unsupported)).toBe("");
  });

  it("processes Illustrator sample without stack overflow", () => {
    const doc = new DOMParser().parseFromString(
      ILLUSTRATOR_SAMPLE_SVG,
      "image/svg+xml",
    );
    const stylesheet = parseSvgStylesheet(doc);

    const svgEl = doc.querySelector("svg");
    expect(svgEl).toBeTruthy();
    const vbParts = svgEl
      ?.getAttribute("viewBox")
      ?.trim()
      .split(/[\s,]+/)
      .map(Number);
    const viewBoxX = vbParts?.[0] ?? 0;
    const viewBoxY = vbParts?.[1] ?? 0;
    const svgWidth = vbParts?.[2] ?? +(svgEl?.getAttribute("width") ?? 100);
    const svgHeight = vbParts?.[3] ?? +(svgEl?.getAttribute("height") ?? 100);
    const vbMaxX = viewBoxX + svgWidth;
    const vbMaxY = viewBoxY + svgHeight;

    const els = Array.from(
      doc.querySelectorAll(
        "path, rect, circle, ellipse, line, polyline, polygon",
      ),
    );

    const fillFlags: boolean[] = [];
    const ds: string[] = [];
    for (const el of els) {
      const rawD = shapeToPathD(el);
      if (!rawD) continue;
      const matrix = getAccumulatedTransform(el);
      const d = applyMatrixToPathD(rawD, matrix);
      const pathBounds = computePathsBounds([d]);
      if (
        pathBounds &&
        (pathBounds.minX > vbMaxX ||
          pathBounds.maxX < viewBoxX ||
          pathBounds.minY > vbMaxY ||
          pathBounds.maxY < viewBoxY)
      ) {
        continue;
      }
      fillFlags.push(getEffectiveFill(el, stylesheet) !== null);
      hasVisibleStroke(el, stylesheet);
      ds.push(d);
    }

    const bounds = computePathsBounds(ds);
    expect(bounds).toBeTruthy();

    const spacingUnits = 2 / (25.4 / 96);
    for (let i = 0; i < ds.length; i++) {
      if (!fillFlags[i]) continue;
      expect(() => generateHatchPaths(ds[i], spacingUnits, 45)).not.toThrow();
    }
  });
});
