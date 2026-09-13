/**
 * Static assets for the sandboxed plugin host, inlined as string constants
 * rather than shipped as files.
 *
 * These are served to a hidden, sandboxed BrowserWindow over a privileged
 * custom scheme (see pluginSandbox.ts). Inlining them means there is no
 * runtime asset path to resolve, so nothing here can break when the app is
 * packed into app.asar — the failure mode the previous utilityProcess host
 * needed an `asarUnpack` entry to work around.
 *
 * The trade-off is that the browser-side code below is a string, so it gets
 * no type checking. Keep it small and dependency-free; anything that grows
 * logic belongs in the main-process code that drives it.
 */

import { MAX_BITMAP_RENDERER_PATH_LENGTH } from "../../types";

export const PLUGIN_SCHEME = "tfplugin";
export const PLUGIN_HOST_ORIGIN = `${PLUGIN_SCHEME}://host`;

/**
 * The page holds no plugin code itself — it only brokers messages between the
 * main process and the worker. `connect-src 'none'` is the control that
 * actually contains a plugin: fetch, XHR, WebSocket, importScripts, dynamic
 * import and sendBeacon are all denied by it (verified against live local
 * HTTP and WebSocket listeners — nothing reached either).
 */
export const PAGE_CSP = [
  "default-src 'none'",
  `script-src ${PLUGIN_HOST_ORIGIN}`,
  `worker-src ${PLUGIN_HOST_ORIGIN}`,
  "connect-src 'none'",
  "img-src 'none'",
  "style-src 'none'",
  "frame-src 'none'",
  "object-src 'none'",
].join("; ");

/**
 * The worker needs 'unsafe-eval' because plugin modules are evaluated with
 * `new Function`. That is not a weakening of the boundary: the worker has no
 * DOM, no Node, and no network, so evaluating code we deliberately chose to
 * run buys an attacker nothing it did not already have. Network containment
 * comes from `connect-src 'none'`, which is unaffected.
 */
export const WORKER_CSP = [
  "default-src 'none'",
  "script-src 'unsafe-eval'",
  "connect-src 'none'",
].join("; ");

export const HOST_HTML = `<!doctype html>
<meta charset="utf-8">
<title>terraForge plugin host</title>
<script src="${PLUGIN_HOST_ORIGIN}/host.js"></script>`;

/**
 * Runs in the sandboxed page. Owns the worker's lifecycle so that killing a
 * wedged plugin costs a `terminate()` rather than tearing down a process:
 * the page itself stays responsive and is reused across restarts.
 */
export const HOST_JS = String.raw`
"use strict";
var worker = null;
var cachedInit = null;

function send(message) { window.__terraForgePluginHost.send(message); }

function startWorker() {
  worker = new Worker("${PLUGIN_HOST_ORIGIN}/worker.js");
  worker.onmessage = function (event) { send(event.data); };
  worker.onerror = function (event) {
    send({ type: "load-error", message: String((event && event.message) || "worker error") });
  };
  worker.postMessage(cachedInit);
}

function stopWorker() {
  if (worker) { worker.terminate(); worker = null; }
}

window.__terraForgePluginHost.onMessage(function (message) {
  if (message.type === "init") {
    cachedInit = message;
    stopWorker();
    startWorker();
    return;
  }
  if (message.type === "restart") {
    stopWorker();
    if (cachedInit) startWorker();
    return;
  }
  if (message.type === "render") {
    if (!worker) { send({ type: "error", reqId: message.reqId, message: "Plugin worker is not running." }); return; }
    // Hand the pixel buffer over rather than copying it — this page has no
    // further use for it, and at full resolution that copy is megabytes on
    // every render. Only transfer a view that owns its whole buffer.
    var transfer = [];
    var values = message.luminance && message.luminance.values;
    if (values && values.buffer && values.byteLength === values.buffer.byteLength) {
      transfer.push(values.buffer);
    }
    worker.postMessage(message, transfer);
  }
});

send({ type: "page-ready" });
`;

/**
 * Runs in the worker. Evaluates the plugin's CommonJS modules from an
 * in-memory map supplied by the main process — the plugin never reads from
 * disk itself, so `require` resolves only against files the main process
 * already chose to hand over, all of them from inside the plugin's own folder.
 */
export const WORKER_JS = String.raw`
"use strict";
var pluginExports = null;

function dirname(path) {
  var index = path.lastIndexOf("/");
  return index === -1 ? "" : path.slice(0, index);
}

function normalize(path) {
  var parts = path.split("/");
  var out = [];
  for (var i = 0; i < parts.length; i++) {
    var part = parts[i];
    if (part === "" || part === ".") continue;
    if (part === "..") { out.pop(); continue; }
    out.push(part);
  }
  return out.join("/");
}

function makeLoader(modules) {
  var cache = Object.create(null);

  function resolve(fromPath, id) {
    if (id.charAt(0) !== ".") {
      throw new Error(
        'Plugin tried to require("' + id + '"). Sandboxed plugins have no Node modules — ' +
        "only relative paths to files inside the plugin's own folder are available."
      );
    }
    var base = normalize(dirname(fromPath) + "/" + id);
    var candidates = [base, base + ".js", base + "/index.js", base + ".json"];
    for (var i = 0; i < candidates.length; i++) {
      if (Object.prototype.hasOwnProperty.call(modules, candidates[i])) return candidates[i];
    }
    throw new Error('Cannot find module "' + id + '" in plugin folder (looked for ' + candidates.join(", ") + ").");
  }

  function load(path) {
    if (cache[path]) return cache[path].exports;
    var source = modules[path];
    if (path.slice(-5) === ".json") {
      var parsed = { exports: JSON.parse(source) };
      cache[path] = parsed;
      return parsed.exports;
    }
    var module = { exports: {} };
    cache[path] = module;
    var localRequire = function (id) { return load(resolve(path, id)); };
    var factory = new Function("module", "exports", "require", "__filename", "__dirname", source);
    factory(module, module.exports, localRequire, path, dirname(path));
    return module.exports;
  }

  return load;
}

self.onmessage = function (event) {
  var message = event.data;

  if (message.type === "init") {
    try {
      var load = makeLoader(message.modules);
      pluginExports = load(message.entry);
      if (!pluginExports || typeof pluginExports.render !== "function") {
        throw new Error("Plugin module does not export a render() function.");
      }
      self.postMessage({ type: "ready" });
    } catch (err) {
      self.postMessage({ type: "load-error", message: describe(err) });
    }
    return;
  }

  if (message.type === "render") {
    Promise.resolve()
      .then(function () { return pluginExports.render(message.luminance, message.settings, message.baseScale); })
      .then(function (path) {
        if (typeof path !== "string") {
          throw new Error("render() must return a string, got " + typeof path + ".");
        }
        // Caught here so a runaway string is never transported out of the
        // sandbox; the result is checked again before it enters the document.
        if (path.length > ${MAX_BITMAP_RENDERER_PATH_LENGTH}) {
          throw new Error(
            "render() returned " + path.length + " characters of path data, over the " +
            ${MAX_BITMAP_RENDERER_PATH_LENGTH} + " limit."
          );
        }
        self.postMessage({ type: "result", reqId: message.reqId, path: path });
      })
      .catch(function (err) {
        self.postMessage({ type: "error", reqId: message.reqId, message: describe(err) });
      });
  }
};

function describe(err) {
  if (err instanceof Error) return err.stack || err.message;
  return String(err);
}
`;
