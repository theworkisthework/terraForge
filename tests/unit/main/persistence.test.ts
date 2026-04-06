import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { mkdtemp, rm, writeFile } from "fs/promises";
import { tmpdir } from "os";
import { join } from "path";
import {
  BUILT_IN_PAGE_SIZES,
  createPersistence,
} from "../../../src/main/config/persistence";

describe("main config persistence", () => {
  let tempDir: string;

  beforeEach(async () => {
    tempDir = await mkdtemp(join(tmpdir(), "terraforge-persist-"));
  });

  afterEach(async () => {
    await rm(tempDir, { recursive: true, force: true });
  });

  it("returns cloned default machine configs when file is missing", async () => {
    const persistence = createPersistence(tempDir);

    const first = await persistence.loadConfigs();
    first[0].connection.host = "mutated.local";

    const second = await persistence.loadConfigs();

    expect(second[0].connection.host).toBe("fluidnc.local");
    expect(second).not.toBe(first);
  });

  it("creates page-sizes.json with defaults and returns cloned values", async () => {
    const persistence = createPersistence(tempDir);

    const first = await persistence.loadPageSizes();
    first[0].name = "Mutated";

    const second = await persistence.loadPageSizes();

    expect(second[0].name).toBe(BUILT_IN_PAGE_SIZES[0].name);
    expect(second).not.toBe(first);
  });

  it("falls back to built-in page sizes when page-sizes.json is malformed", async () => {
    const pageSizesPath = join(tempDir, "page-sizes.json");
    await writeFile(pageSizesPath, "{not-valid-json", "utf-8");

    const persistence = createPersistence(tempDir);
    const result = await persistence.loadPageSizes();

    expect(result).toHaveLength(BUILT_IN_PAGE_SIZES.length);
    expect(result).toEqual(BUILT_IN_PAGE_SIZES);
  });
});
