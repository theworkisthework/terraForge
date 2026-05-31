import { test, expect } from "@playwright/test";
import type { ElectronApplication, Page } from "playwright";
import * as fs from "fs";
import * as os from "os";
import * as path from "path";
import { launchApp, closeApp, mockOpenDialog, mockSaveDialog } from "./helpers";

const ROOT = path.resolve(__dirname, "..", "..");
const defaultSvgDir = path.join(ROOT, "tests", "fixtures", "real_world_svgs");
const svgDirEnv = (process.env.TF_E2E_SVG_DIR ?? "").trim();
const svgDir = path.resolve(svgDirEnv || defaultSvgDir);
const maxFiles = Number(process.env.TF_E2E_MAX_SVGS ?? "0");

function discoverSvgFiles(dir: string): string[] {
  if (!dir) return [];
  if (!fs.existsSync(dir) || !fs.statSync(dir).isDirectory()) return [];
  const files = fs
    .readdirSync(dir)
    .filter((name) => /\.svg$/i.test(name))
    .sort((a, b) => a.localeCompare(b));
  if (maxFiles > 0) return files.slice(0, maxFiles);
  return files;
}

const svgFiles = discoverSvgFiles(svgDir);

function normalizeGcodeForSnapshot(gcode: string): string {
  return gcode
    .replace(/\r\n/g, "\n")
    .replace(/^; Machine\s+:.*$/m, "; Machine  : <normalized>")
    .replace(/^; Generated:.*$/m, "; Generated: <normalized>")
    .replace(/^; Vinyl\s+:.*\n?/gm, "")
    .replace(/^; Weed bd\s+:.*\n?/gm, "")
    .trim();
}

async function setCheckboxState(
  page: Page,
  labelText: string,
  checked: boolean,
): Promise<void> {
  await ensureTabForControl(page, labelText);
  const checkbox = page.getByLabel(labelText, { exact: false });
  await expect(checkbox).toBeVisible({ timeout: 5_000 });
  await checkbox.setChecked(checked);
}

async function ensureTabForControl(
  page: Page,
  labelText: string,
): Promise<void> {
  const label = labelText.toLowerCase();
  const tabName =
    label.includes("optimise") || label.includes("join")
      ? "Paths"
      : label.includes("save") ||
          label.includes("upload") ||
          label.includes("export")
        ? "Output"
        : "Options";

  const tab = page.getByRole("tab", { name: new RegExp(`^${tabName}$`, "i") });
  await expect(tab).toBeVisible({ timeout: 5_000 });
  await tab.click();
}

async function ensurePathsSectionOpen(page: Page): Promise<void> {
  await ensureTabForControl(page, "Optimise paths");
  const optimiseCheckbox = page.getByLabel("Optimise paths", { exact: false });
  await expect(optimiseCheckbox).toBeVisible({ timeout: 5_000 });
}

test.describe("real-world SVG -> G-code snapshots", () => {
  test.skip(
    svgFiles.length === 0,
    `No SVG files found in ${svgDir}. Set TF_E2E_SVG_DIR to override.`,
  );

  for (const svgFile of svgFiles) {
    test(`snapshot for ${svgFile}`, async ({}, testInfo) => {
      test.setTimeout(180_000);

      // Keep snapshot filenames OS-agnostic so local (win32) and CI (linux)
      // runs validate against the same baseline files.
      testInfo.snapshotSuffix = "";

      const { electronApp, window, userDataDir } = await launchApp();
      const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "terraforge-e2e-"));

      try {
        const svgPath = path.join(svgDir, svgFile);
        const savePath = path.join(
          tempDir,
          `${path.parse(svgFile).name}.snapshot.gcode`,
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
        await setCheckboxState(window, "Optimise paths", false);
        await setCheckboxState(window, "Join nearby paths", false);

        await setCheckboxState(window, "Save to computer", true);
        await mockSaveDialog(electronApp as ElectronApplication, savePath);

        await window
          .locator("button")
          .filter({ hasText: /^Generate$/ })
          .click();

        await expect
          .poll(() => fs.existsSync(savePath), {
            timeout: 120_000,
          })
          .toBe(true);

        await expect(generateBtn).toHaveText("Generate G-code", {
          timeout: 10_000,
        });

        const gcode = fs.readFileSync(savePath, "utf-8");
        const snapshotName = `${path.parse(svgFile).name}.gcode`;
        await expect(normalizeGcodeForSnapshot(gcode)).toMatchSnapshot(
          snapshotName,
        );
      } finally {
        await closeApp(electronApp as ElectronApplication, userDataDir);
        fs.rmSync(tempDir, { recursive: true, force: true });
      }
    });
  }
});
