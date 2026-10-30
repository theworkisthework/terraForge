import { describe, expect, it } from "vitest";
import { colorDisplayNames, toFilenameSafe } from "../../src/renderer/src/features/machine/utils/colorFileNames";
import { vectorObjectsForImport } from "../../src/renderer/src/store/canvasStore/services/vectorObjects";
import { createSvgImport, createSvgPath } from "../helpers/factories";

const entry = (color: string, ...names: (string | undefined)[]) => ({
  color,
  objects: names.length ? names.map((colorName) => ({ colorName })) : [{}],
});

describe("per-colour G-code file names", () => {
  it("names a separated ink after the ink", () => {
    const names = colorDisplayNames([entry("#00ffff", "Cyan", "Cyan"), entry("#1f3fbf", "Fineliner blue")]);
    expect(names.get("#00ffff")).toBe("Cyan");
    expect(toFilenameSafe(names.get("#1f3fbf")!)).toBe("fineliner_blue");
  });

  it("names a basic colour by its CSS name, and anything else by its hex", () => {
    const names = colorDisplayNames([entry("#ff0000"), entry("#3a6aaa")]);
    expect(names.get("#ff0000")).toBe("red");
    expect(toFilenameSafe(names.get("#3a6aaa")!)).toBe("hex-3a6aaa");
  });

  it("falls back when a colour's objects disagree on a name", () => {
    expect(colorDisplayNames([entry("#ff0000", "Red ink", "Scarlet")]).get("#ff0000")).toBe("red");
  });

  it("keeps two colours with one name apart, so no file overwrites another", () => {
    const names = colorDisplayNames([entry("#0000ff", "Blue"), entry("#1f3fbf", "Blue")]);
    const files = [...names.values()].map(toFilenameSafe);
    expect(new Set(files).size).toBe(2);
    expect(files).toEqual(["blue_0000ff", "blue_1f3fbf"]);
  });

  it("takes a bitmap ink's name from its path, but never an SVG path's label", () => {
    const ink = createSvgPath({ label: "Magenta", sourceColor: "#ff00ff", strokeColor: "#ff00ff" });
    const svgPath = createSvgPath({ label: "path12", sourceColor: "#ff00ff", strokeColor: "#ff00ff" });
    expect(vectorObjectsForImport(createSvgImport({ kind: "bitmap", paths: [ink] }))[0].colorName).toBe("Magenta");
    expect(vectorObjectsForImport(createSvgImport({ paths: [svgPath] }))[0].colorName).toBeUndefined();
  });
});
