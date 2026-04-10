import { describe, it, expect } from "vitest";
import { generateCopyName } from "./clipboard";

describe("clipboard service", () => {
  it("returns '<base> copy' when no copy exists", () => {
    expect(generateCopyName("flower", [])).toBe("flower copy");
  });

  it("increments copy index when needed", () => {
    const names = ["flower copy", "flower copy (2)", "flower copy (3)"];
    expect(generateCopyName("flower", names)).toBe("flower copy (4)");
  });

  it("normalizes source names that already include copy suffix", () => {
    const names = ["flower copy", "flower copy (2)"];
    expect(generateCopyName("flower copy", names)).toBe("flower copy (3)");
    expect(generateCopyName("flower copy (2)", names)).toBe("flower copy (3)");
  });
});
