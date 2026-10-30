import { describe, expect, it } from "vitest";
import { exceedsOutputBudget, MAX_OUTPUT_UNITS } from "../../../src/main/plugins/pluginOutputBudget";
import { HOST_JS } from "../../../src/main/plugins/pluginSandboxAssets";

/** The host page's plain-JavaScript twin, lifted out of its source text. */
function hostExceedsBudget(): (output: unknown) => boolean {
  const start = HOST_JS.indexOf("function exceedsBudget");
  const end = HOST_JS.indexOf("function startWorker");
  return new Function(`${HOST_JS.slice(start, end)}; return exceedsBudget;`)();
}

const cases: [string, () => unknown, boolean][] = [
  ["a path string", () => "M0 0 L10 10", false],
  ["a layer list with dots", () => [{ d: "M0 0", dots: [{ x: 1, y: 2, d: "M1 2" }] }], false],
  ["{ layers, warnings }", () => ({ layers: [{ d: "M0 0" }], warnings: ["careful"] }), false],
  ["null", () => null, false],
  ["a string over budget", () => "x".repeat(MAX_OUTPUT_UNITS + 1), true],
  ["a typed array over budget", () => new Uint8Array(MAX_OUTPUT_UNITS + 1), true],
  ["an oversized field the path check never sees", () => [{ d: "M0 0", label: "x".repeat(MAX_OUTPUT_UNITS) }], true],
  ["an oversized object key", () => ({ ["k".repeat(MAX_OUTPUT_UNITS + 1)]: 1 }), true],
  // Over budget on its length alone; must be refused without walking its items.
  ["a huge sparse array", () => new Array(MAX_OUTPUT_UNITS), true],
  [
    "a cycle",
    () => {
      const loop: unknown[] = [];
      loop.push(loop);
      return loop;
    },
    true,
  ],
];

describe("output budget", () => {
  const host = hostExceedsBudget();

  it.each(cases)("main process: %s", (_name, build, over) => {
    expect(exceedsOutputBudget(build())).toBe(over);
  });

  it.each(cases)("host page agrees: %s", (_name, build, over) => {
    expect(host(build())).toBe(over);
  });

  it("is not overflowed by deep nesting", () => {
    let deep: unknown = "end";
    for (let i = 0; i < 200_000; i++) deep = [deep];
    expect(exceedsOutputBudget(deep)).toBe(false);
  });
});
