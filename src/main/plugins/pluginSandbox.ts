import { protocol, session, type Session } from "electron";
import {
  HOST_HTML,
  HOST_JS,
  PAGE_CSP,
  PLUGIN_SCHEME,
  WORKER_CSP,
  WORKER_JS,
} from "./pluginSandboxAssets";

/**
 * Must be called at module scope in the main process, before the app's
 * `ready` event — Electron only accepts privileged scheme registration that
 * early. Marking the scheme `standard` and `secure` gives the host page a
 * real, unique origin, which is what makes workers and CSP behave normally
 * (a file:// page gets an opaque origin and cannot spawn a worker at all).
 */
export function registerPluginScheme(): void {
  protocol.registerSchemesAsPrivileged([
    {
      scheme: PLUGIN_SCHEME,
      privileges: { standard: true, secure: true, supportFetchAPI: false, corsEnabled: false },
    },
  ]);
}

const preparedSessions = new WeakSet<Session>();

/**
 * One partition per plugin, so two plugins share no storage and no cache.
 * The protocol handler serves only the three fixed host assets; plugin code
 * itself never travels over this scheme, it is posted into the worker as
 * data, so there is no URL a plugin could fetch to reach another's source.
 */
export function pluginSandboxSession(pluginId: string): Session {
  const partition = `${PLUGIN_SCHEME}-${encodeURIComponent(pluginId)}`;
  const ses = session.fromPartition(partition, { cache: false });
  if (preparedSessions.has(ses)) return ses;
  preparedSessions.add(ses);

  ses.protocol.handle(PLUGIN_SCHEME, (request) => {
    const { pathname } = new URL(request.url);
    if (pathname === "/host.html") {
      return new Response(HOST_HTML, {
        headers: { "content-type": "text/html; charset=utf-8", "content-security-policy": PAGE_CSP },
      });
    }
    if (pathname === "/host.js") {
      return new Response(HOST_JS, {
        headers: { "content-type": "text/javascript; charset=utf-8", "content-security-policy": PAGE_CSP },
      });
    }
    if (pathname === "/worker.js") {
      return new Response(WORKER_JS, {
        headers: { "content-type": "text/javascript; charset=utf-8", "content-security-policy": WORKER_CSP },
      });
    }
    return new Response("Not found", { status: 404 });
  });

  // Belt-and-braces behind the page CSP: refuse every request that is not one
  // of our own host assets, so a future CSP mistake cannot silently become an
  // exfiltration path.
  ses.webRequest.onBeforeRequest((details, callback) =>
    callback({ cancel: !details.url.startsWith(`${PLUGIN_SCHEME}://`) }),
  );

  // A sandboxed plugin has no business holding any web permission.
  ses.setPermissionRequestHandler((_contents, _permission, callback) => callback(false));
  ses.setPermissionCheckHandler(() => false);

  return ses;
}
