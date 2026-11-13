/**
 * Opening links outside the app.
 *
 * `shell.openExternal` hands a URL to the operating system, which will run
 * whatever is registered for its scheme: `file:` opens — and for a program,
 * launches — a local file, and other schemes start other applications. Only
 * the two kinds of link the app has a use for are passed on.
 */
import { shell } from "electron";

const ALLOWED_PROTOCOLS: ReadonlySet<string> = new Set(["https:", "mailto:"]);

function parseAllowed(url: unknown): URL | null {
  if (typeof url !== "string") return null;
  try {
    const parsed = new URL(url);
    return ALLOWED_PROTOCOLS.has(parsed.protocol) ? parsed : null;
  } catch {
    return null;
  }
}

/** Whether `url` is a web page or an e-mail address, and so safe to open. */
export function isAllowedExternalUrl(url: unknown): url is string {
  return parseAllowed(url) !== null;
}

/**
 * Opens an `https:` or `mailto:` link in the user's browser or mail program.
 * @throws for anything else, without opening it.
 */
export async function openExternalUrl(url: unknown): Promise<void> {
  const parsed = parseAllowed(url);
  if (!parsed) {
    throw new Error(`Refused to open ${JSON.stringify(url) ?? String(url)}: only https and mailto links are opened.`);
  }
  // As parsed, so that what was checked is exactly what is opened.
  await shell.openExternal(parsed.href);
}
