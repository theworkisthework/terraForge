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
import { MAX_OUTPUT_UNITS, MAX_PLUGIN_MESSAGE_LENGTH, MAX_REQ_ID_LENGTH } from "./pluginOutputBudget";

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

// Plain-JavaScript twin of exceedsOutputBudget in pluginOutputBudget.ts.
function exceedsBudget(output) {
  var units = 0;
  var pending = [output];
  while (pending.length > 0) {
    var value = pending.pop();
    if (typeof value === "string") {
      units += value.length;
    } else if (typeof value !== "object" || value === null) {
      units += 8;
    } else if (ArrayBuffer.isView(value)) {
      units += value.byteLength;
    } else if (Array.isArray(value)) {
      units += 8 + value.length * 8;
      if (units > ${MAX_OUTPUT_UNITS}) return true;
      for (var i = 0; i < value.length; i++) pending.push(value[i]);
    } else {
      units += 8;
      var keys = Object.keys(value);
      for (var k = 0; k < keys.length; k++) {
        units += keys[k].length;
        if (units > ${MAX_OUTPUT_UNITS}) return true;
        pending.push(value[keys[k]]);
      }
    }
    if (units > ${MAX_OUTPUT_UNITS}) return true;
  }
  return false;
}

function clip(value, max) { return typeof value === "string" ? value.slice(0, max) : ""; }

// The worker shares a realm with the plugin, so anything it posts may have
// been written by a hostile plugin rather than the worker script. This page
// cannot be reached by plugin code, so every message is rebuilt here from
// the fields the main process expects, each one bounded, before it crosses
// into the main process. Anything else, a forged "page-ready" included, is
// dropped.
function fromWorker(data) {
  if (!data || typeof data !== "object") return null;
  var reqId = clip(data.reqId, ${MAX_REQ_ID_LENGTH});
  switch (data.type) {
    case "ready":
      return { type: "ready" };
    case "load-error":
      return { type: "load-error", message: clip(data.message, ${MAX_PLUGIN_MESSAGE_LENGTH}) };
    case "error":
      return { type: "error", reqId: reqId, message: clip(data.message, ${MAX_PLUGIN_MESSAGE_LENGTH}) };
    case "result":
      if (exceedsBudget(data.output)) {
        return { type: "error", reqId: reqId, message: "render() result is larger than the size a plugin may return." };
      }
      return { type: "result", reqId: reqId, output: data.output };
  }
  return null;
}

function startWorker() {
  worker = new Worker("${PLUGIN_HOST_ORIGIN}/worker.js");
  worker.onmessage = function (event) {
    var message = fromWorker(event.data);
    if (message) send(message);
  };
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
    var source = message.context && message.context.source;
    var values = source && source.values;
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
// Source images kept between renders, by id. The main process decides what
// is kept and says what to drop, and sends pixels only for an id it knows
// this worker does not hold.
var sourceCache = new Map();

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
      .then(function () {
        message.context.source = takeSource(message);
        return pluginExports.render(message.context);
      })
      .then(function (output) {
        // Checked here so a well-behaved plugin gets a precise error about
        // its path data. It is not the boundary: plugin code shares this
        // realm and can post around it, so the host page bounds every
        // message again, and the main process bounds it once more.
        var total = outputLength(output);
        if (total > ${MAX_BITMAP_RENDERER_PATH_LENGTH}) {
          throw new Error(
            "render() returned " + total + " characters of path data, over the " +
            ${MAX_BITMAP_RENDERER_PATH_LENGTH} + " limit."
          );
        }
        self.postMessage({ type: "result", reqId: message.reqId, output: output });
      })
      .catch(function (err) {
        self.postMessage({ type: "error", reqId: message.reqId, message: describe(err) });
      });
  }
};

/**
 * The source image for a render, as the plugin sees it. A kept image is
 * handed over as a copy: a plugin is free to work on its input in place, and
 * on the shared copy that would corrupt every later render of the image.
 * Copying here is a memcpy, far cheaper than the cross-process copy keeping
 * it saves.
 */
function takeSource(message) {
  var evict = Array.isArray(message.evict) ? message.evict : [];
  for (var i = 0; i < evict.length; i++) sourceCache.delete(evict[i]);

  var ref = message.context.source;
  if (!ref) return undefined;
  var values = ref.values;
  if (values) {
    if (ref.store) {
      sourceCache.set(ref.id, values);
      values = values.slice();
    }
  } else {
    values = sourceCache.get(ref.id);
    if (!values) throw new Error("The render's source image was not available to the plugin worker.");
    values = values.slice();
  }
  return { width: ref.width, height: ref.height, values: values };
}

/**
 * A renderer may return a single path string, an array of layers, or
 * { layers, warnings }; a layer may carry a stroked 'd', dots, or both.
 * Totals the path data across all of it so the size ceiling covers every
 * shape. The full structure is validated again outside the sandbox — this is
 * only about not transporting a runaway result.
 */
function outputLength(output) {
  if (typeof output === "string") return output.length;
  var layers = Array.isArray(output) ? output : output && Array.isArray(output.layers) ? output.layers : null;
  if (!layers) {
    throw new Error(
      "render() must return a path string, an array of layers, or { layers, warnings }, got " + typeof output + "."
    );
  }
  var total = 0;
  for (var i = 0; i < layers.length; i++) {
    var layer = layers[i];
    if (!layer || (typeof layer.d !== "string" && !Array.isArray(layer.dots))) {
      throw new Error("render() layer " + i + " has neither a 'd' path string nor a dots array.");
    }
    if (typeof layer.d === "string") total += layer.d.length;
    if (Array.isArray(layer.dots)) {
      for (var j = 0; j < layer.dots.length; j++) {
        var dot = layer.dots[j];
        // A dot's position costs about as much to carry as a short path.
        total += (dot && typeof dot.d === "string" ? dot.d.length : 0) + 16;
      }
    }
  }
  return total;
}

function describe(err) {
  if (err instanceof Error) return err.stack || err.message;
  return String(err);
}
`;
