import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({ openExternal: vi.fn() }));

vi.mock("electron", () => ({ shell: { openExternal: mocks.openExternal } }));

import { isAllowedExternalUrl, openExternalUrl } from "../../../src/main/security/externalLinks";

describe("external links", () => {
  beforeEach(() => {
    mocks.openExternal.mockReset();
    mocks.openExternal.mockResolvedValue(undefined);
  });

  it.each(["https://github.com/theworkisthework/terraForge", "HTTPS://EXAMPLE.COM", "mailto:someone@example.com"])("allows %s", (url) => {
    expect(isAllowedExternalUrl(url)).toBe(true);
  });

  it.each([
    "http://example.com",
    "file:///etc/passwd",
    "file:///C:/Windows/System32/calc.exe",
    "javascript:alert(1)",
    "data:text/html,<script>alert(1)</script>",
    "smb://server/share",
    "ms-msdt:/id",
    "vscode://file/etc/passwd",
    "xhttps://example.com",
    "//example.com",
    "example.com",
    "",
  ])("does not allow %s", (url) => {
    expect(isAllowedExternalUrl(url)).toBe(false);
  });

  it.each([undefined, null, 42, {}, ["https://example.com"]])("does not allow %j, which is not a string", (url) => {
    expect(isAllowedExternalUrl(url)).toBe(false);
  });

  it("opens an allowed link as it was parsed", async () => {
    await openExternalUrl("HTTPS://Example.com/a b");
    expect(mocks.openExternal).toHaveBeenCalledWith("https://example.com/a%20b");

    await openExternalUrl("mailto:someone@example.com");
    expect(mocks.openExternal).toHaveBeenLastCalledWith("mailto:someone@example.com");
  });

  it("refuses anything else without opening it, and says what it was", async () => {
    await expect(openExternalUrl("file:///etc/passwd")).rejects.toThrow('Refused to open "file:///etc/passwd": only https and mailto links are opened.');
    await expect(openExternalUrl(undefined)).rejects.toThrow(/Refused to open undefined/);
    expect(mocks.openExternal).not.toHaveBeenCalled();
  });

  it("passes on a failure to open an allowed link", async () => {
    mocks.openExternal.mockRejectedValue(new Error("no browser"));
    await expect(openExternalUrl("https://example.com")).rejects.toThrow("no browser");
  });
});
