import { Capacitor, CapacitorHttp } from "@capacitor/core";

// FluidNC serves plain HTTP on the LAN. Inside the Android WebView, `fetch`
// to another origin is subject to CORS, which FluidNC does not reliably
// satisfy, so on native we route requests through CapacitorHttp (native
// HttpURLConnection — no CORS, cleartext allowed by the manifest).

export type HttpMethod = "GET" | "POST" | "DELETE";

export interface HttpOptions {
  method?: HttpMethod;
  body?: string;
  headers?: Record<string, string>;
  /** 0 = no timeout */
  timeoutMs?: number;
  signal?: AbortSignal;
}

export interface HttpResult {
  status: number;
  ok: boolean;
  text: string;
}

const isNative = () => Capacitor.isNativePlatform();

/**
 * In `npm run mobile:dev` (a desktop browser) route plotter requests through
 * the Vite dev server, which has no CORS restrictions — see
 * vite.mobile.config.mjs. Production/native builds go direct.
 */
function viaDevProxy(url: string): string {
  if (!import.meta.env.DEV || isNative()) return url;
  const m = /^http:\/\/([^/]+)(\/.*)?$/.exec(url);
  return m ? `/__fluidnc/${m[1]}${m[2] ?? "/"}` : url;
}

function abortError(signal: AbortSignal): Error {
  return signal.reason instanceof Error
    ? signal.reason
    : new Error("Request aborted");
}

function raceAbort<T>(p: Promise<T>, signal?: AbortSignal): Promise<T> {
  if (!signal) return p;
  if (signal.aborted) return Promise.reject(abortError(signal));
  return new Promise<T>((resolve, reject) => {
    const onAbort = () => reject(abortError(signal));
    signal.addEventListener("abort", onAbort, { once: true });
    p.then(resolve, reject).finally(() =>
      signal.removeEventListener("abort", onAbort),
    );
  });
}

export async function http(
  url: string,
  opts: HttpOptions = {},
): Promise<HttpResult> {
  const { method = "GET", body, headers, timeoutMs = 10_000, signal } = opts;

  if (isNative()) {
    const res = await raceAbort(
      CapacitorHttp.request({
        url,
        method,
        headers,
        data: body,
        responseType: "text",
        connectTimeout: timeoutMs || undefined,
        readTimeout: timeoutMs || undefined,
      }),
      signal,
    );
    const text =
      typeof res.data === "string" ? res.data : JSON.stringify(res.data ?? "");
    return { status: res.status, ok: res.status >= 200 && res.status < 300, text };
  }

  const controller = new AbortController();
  const timer =
    timeoutMs > 0
      ? setTimeout(
          () =>
            controller.abort(
              new Error(`Request timed out after ${timeoutMs}ms`),
            ),
          timeoutMs,
        )
      : null;
  const onAbort = () => controller.abort(signal ? abortError(signal) : undefined);
  signal?.addEventListener("abort", onAbort, { once: true });
  try {
    const res = await fetch(viaDevProxy(url), {
      method,
      headers,
      body,
      signal: controller.signal,
    });
    return { status: res.status, ok: res.ok, text: await res.text() };
  } finally {
    if (timer) clearTimeout(timer);
    signal?.removeEventListener("abort", onAbort);
  }
}

/** GET that throws on non-2xx, mirroring the desktop REST client. */
export async function httpOk(
  url: string,
  opts: HttpOptions = {},
): Promise<HttpResult> {
  const res = await http(url, opts);
  if (!res.ok) throw new Error(`HTTP ${res.status} ${opts.method ?? "GET"} ${url}`);
  return res;
}

/** Download a URL as bytes, reporting progress when the platform allows. */
export async function httpBinary(
  url: string,
  onProgress?: (percent: number) => void,
  signal?: AbortSignal,
): Promise<Uint8Array> {
  if (isNative()) {
    // CapacitorHttp returns binary bodies as base64 (no streaming progress).
    const res = await raceAbort(
      CapacitorHttp.request({ url, method: "GET", responseType: "blob" }),
      signal,
    );
    if (res.status < 200 || res.status >= 300)
      throw new Error(`HTTP ${res.status} GET ${url}`);
    const bin = atob(res.data as string);
    const out = new Uint8Array(bin.length);
    for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
    onProgress?.(100);
    return out;
  }
  const res = await fetch(viaDevProxy(url), { signal });
  if (!res.ok) throw new Error(`HTTP ${res.status} GET ${url}`);
  const total = Number(res.headers.get("content-length") ?? 0);
  const reader = res.body?.getReader();
  if (!reader) return new Uint8Array(await res.arrayBuffer());
  const chunks: Uint8Array[] = [];
  let received = 0;
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    chunks.push(value);
    received += value.length;
    if (total > 0) onProgress?.(Math.round((received / total) * 100));
  }
  const out = new Uint8Array(received);
  let offset = 0;
  for (const c of chunks) {
    out.set(c, offset);
    offset += c.length;
  }
  onProgress?.(100);
  return out;
}

/**
 * multipart upload with progress. Uses XHR (not CapacitorHttp) because it is
 * the only WebView API that reports upload progress; FluidNC's /upload
 * endpoint answers CORS preflights well enough for a simple multipart POST.
 */
export function uploadMultipart(
  url: string,
  fields: Record<string, string>,
  file: { name: string; data: Uint8Array | string },
  onProgress?: (percent: number) => void,
  signal?: AbortSignal,
): Promise<void> {
  return new Promise<void>((resolve, reject) => {
    if (signal?.aborted) return reject(new Error("Upload cancelled"));
    const form = new FormData();
    for (const [k, v] of Object.entries(fields)) form.append(k, v);
    // The size field is what FluidNC's /upload handler uses to sanity-check.
    const blob =
      typeof file.data === "string"
        ? new Blob([file.data], { type: "text/plain" })
        : new Blob([file.data as BlobPart], { type: "application/octet-stream" });
    form.append("file", blob, file.name);

    const xhr = new XMLHttpRequest();
    xhr.open("POST", viaDevProxy(url));
    xhr.upload.onprogress = (e) => {
      if (e.lengthComputable && e.total > 0)
        onProgress?.(Math.min(95, Math.round((e.loaded / e.total) * 95)));
    };
    xhr.onload = () =>
      xhr.status >= 400
        ? reject(new Error(`Upload failed: HTTP ${xhr.status}`))
        : resolve();
    xhr.onerror = () => reject(new Error("Upload failed: network error"));
    xhr.ontimeout = () => reject(new Error("Upload failed: timed out"));
    signal?.addEventListener(
      "abort",
      () => {
        xhr.abort();
        reject(new Error("Upload cancelled"));
      },
      { once: true },
    );
    xhr.send(form);
  });
}
