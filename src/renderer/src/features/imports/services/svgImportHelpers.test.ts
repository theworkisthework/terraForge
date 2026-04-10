import { describe, expect, it } from "vitest";
import {
  findContainingLayerId,
  getEffectiveFill,
  getLayerName,
  hasVisibleStroke,
  isDisplayNone,
  isLayerGroup,
  parseSvgLengthMM,
  shapeToPathD,
} from "./svgImportHelpers";

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
});
