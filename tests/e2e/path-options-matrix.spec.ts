import { test, expect } from "@playwright/test";
import type { ElectronApplication, Page } from "playwright";
import * as fs from "fs";
import * as os from "os";
import * as path from "path";
import { launchApp, closeApp, mockOpenDialog, mockSaveDialog } from "./helpers";

const ROOT = path.resolve(__dirname, "..", "..");
const defaultSvgDir = path.join(ROOT, "tests", "fixtures", "real_world_svgs");
const svgDir = path.resolve(
  (process.env.TF_E2E_SVG_DIR ?? defaultSvgDir).trim(),
);
const matrixSvgEnv = (process.env.TF_E2E_MATRIX_SVGS ?? "").trim();
const representativeSvgs = (matrixSvgEnv || "testSVG2.svg,filled.svg")
  .split(",")
  .map((name) => name.trim())
  .filter(Boolean);

const combos = [
  { optimise: false, joinPaths: false, key: "opt0-join0" },
  { optimise: true, joinPaths: false, key: "opt1-join0" },
  { optimise: false, joinPaths: true, key: "opt0-join1" },
  { optimise: true, joinPaths: true, key: "opt1-join1" },
] as const;

function normalizeGcodeForSnapshot(gcode: string): string {
  return gcode
    .replace(/\r\n/g, "\n")
    .replace(/^; Machine\s+:.*$/m, "; Machine  : <normalized>")
    .replace(/^; Generated:.*$/m, "; Generated: <normalized>")
    .trim();
}

function readNormalizedSnapshot(snapshotPath: string): string {
  return normalizeGcodeForSnapshot(fs.readFileSync(snapshotPath, "utf-8"));
}

async function setCheckboxState(
  page: Page,
  labelText: string,
  checked: boolean,
): Promise<void> {
  const checkbox = page.getByLabel(labelText, { exact: false });
  await expect(checkbox).toBeVisible({ timeout: 5_000 });
  await checkbox.setChecked(checked);
}

async function ensurePathsSectionOpen(page: Page): Promise<void> {
  const optimiseCheckbox = page.getByLabel("Optimise paths", { exact: false });
  if (await optimiseCheckbox.isVisible().catch(() => false)) return;
  await page.locator("button:has-text('Paths')").click();
  await expect(optimiseCheckbox).toBeVisible({ timeout: 5_000 });
}

test.describe("gcode path options matrix snapshots", () => {
  test.skip(
    !fs.existsSync(svgDir) || !fs.statSync(svgDir).isDirectory(),
    `SVG fixture directory not found: ${svgDir}`,
  );

  for (const svgFile of representativeSvgs) {
    const svgPath = path.join(svgDir, svgFile);
    for (const combo of combos) {
      test(`${svgFile} [${combo.key}]`, async ({}, testInfo) => {
        test.skip(!fs.existsSync(svgPath), `Missing fixture: ${svgPath}`);

        // Share snapshots between local and CI regardless of platform.
        testInfo.snapshotSuffix = "";

        const { electronApp, window, userDataDir } = await launchApp();
        const tempDir = fs.mkdtempSync(
          path.join(os.tmpdir(), "terraforge-e2e-"),
        );

        try {
          const savePath = path.join(
            tempDir,
            `${path.parse(svgFile).name}.${combo.key}.gcode`,
          );

          await mockOpenDialog(electronApp as ElectronApplication, svgPath);
          await window.locator("button:has-text('Import')").click();

          const generateBtn = window.locator(
            "button:has-text('Generate G-code')",
          );
          await expect(generateBtn).toBeEnabled({ timeout: 20_000 });

          await generateBtn.click();
          await expect(
            window.locator("h2:has-text('Generate G-code')"),
          ).toBeVisible({
            timeout: 5_000,
          });

          await ensurePathsSectionOpen(window);
          await setCheckboxState(window, "Optimise paths", combo.optimise);
          await setCheckboxState(window, "Join nearby paths", combo.joinPaths);

          await setCheckboxState(window, "Save to computer", true);
          await mockSaveDialog(electronApp as ElectronApplication, savePath);

          await window
            .locator("button")
            .filter({ hasText: /^Generate$/ })
            .click();
          await expect(generateBtn).toHaveText("Generate G-code", {
            timeout: 60_000,
          });

          await expect
            .poll(() => fs.existsSync(savePath), {
              timeout: 20_000,
            })
            .toBe(true);

          const gcode = fs.readFileSync(savePath, "utf-8");
          const snapshotName = `${path.parse(svgFile).name}.${combo.key}.gcode`;
          const snapshotPath = testInfo.snapshotPath(snapshotName);

          expect(normalizeGcodeForSnapshot(gcode)).toBe(
            readNormalizedSnapshot(snapshotPath),
          );
        } finally {
          await closeApp(electronApp as ElectronApplication, userDataDir);
          fs.rmSync(tempDir, { recursive: true, force: true });
        }
      });
    }
  }
});
