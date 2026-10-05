import { useState } from "react";
import { Button } from "../../../renderer/src/components/ui";
import { useMachineStore } from "../../../renderer/src/store/machineStore";
import { useThemeStore } from "../../../renderer/src/store/themeStore";
import { sendLogged } from "../commands";
import { connectActive, disconnectActive, useSession } from "../session";

export function MachineScreen() {
  const updateConfig = useMachineStore((s) => s.updateConfig);
  const connected = useMachineStore((s) => s.connected);
  const wsLive = useMachineStore((s) => s.wsLive);
  const fwInfo = useMachineStore((s) => s.fwInfo);
  const error = useSession((s) => s.connectError);
  const log = useSession((s) => s.log);
  const theme = useThemeStore((s) => s.theme);
  const toggleTheme = useThemeStore((s) => s.toggleTheme);
  const [busy, setBusy] = useState(false);
  // Single-machine MVP: the store already activates the first config.
  const active = useMachineStore((s) => s.activeConfig());

  const toggleConnection = async () => {
    setBusy(true);
    try {
      await (connected ? disconnectActive() : connectActive());
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="h-full overflow-y-auto p-4 space-y-5">
      {active && (
        <section className="space-y-3">
          <h2 className="text-xs font-semibold uppercase tracking-wider text-content-muted">
            Machine
          </h2>
          <label className="block text-xs text-content-muted">
            Name
            <input
              key={`${active.id}-name`}
              defaultValue={active.name}
              autoCapitalize="words"
              onBlur={(e) => {
                const name = e.target.value.trim();
                if (name && name !== active.name)
                  updateConfig(active.id, { name });
                else e.target.value = active.name;
              }}
              className="mt-1 w-full bg-app border border-border-ui rounded px-3 py-2 text-base text-content"
            />
          </label>
          <div className="grid grid-cols-[1fr_6rem] gap-2">
            <label className="text-xs text-content-muted">
              Host
              <input
                key={`${active.id}-host`}
                defaultValue={active.connection.host ?? ""}
                disabled={connected}
                inputMode="url"
                autoCapitalize="none"
                autoCorrect="off"
                onBlur={(e) =>
                  updateConfig(active.id, {
                    connection: {
                      ...active.connection,
                      host: e.target.value.trim(),
                    },
                  })
                }
                className="mt-1 w-full bg-app border border-border-ui rounded px-3 py-2 text-base text-content disabled:opacity-60"
              />
            </label>
            <label className="text-xs text-content-muted">
              Port
              <input
                key={`${active.id}-port`}
                defaultValue={active.connection.port ?? 80}
                disabled={connected}
                inputMode="numeric"
                onBlur={(e) =>
                  updateConfig(active.id, {
                    connection: {
                      ...active.connection,
                      port: Number(e.target.value) || 80,
                    },
                  })
                }
                className="mt-1 w-full bg-app border border-border-ui rounded px-3 py-2 text-base text-content disabled:opacity-60"
              />
            </label>
          </div>
        </section>
      )}

      <Button
        variant={connected ? "secondary" : "primary"}
        size="lg"
        className="w-full py-3 text-base"
        disabled={!active || busy}
        loading={busy}
        onClick={toggleConnection}
      >
        {busy ? "Working…" : connected ? "Disconnect" : "Connect"}
      </Button>

      {error && <p className="text-sm text-red-400">{error}</p>}
      {connected && (
        <p className="text-xs text-content-muted">
          {fwInfo ?? "Firmware unknown"} ·{" "}
          {wsLive ? "live" : "waiting for socket"}
        </p>
      )}

      <section>
        <h2 className="text-xs font-semibold uppercase tracking-wider text-content-muted mb-2">
          Console
        </h2>
        <div className="bg-app border border-border-ui rounded p-2 h-40 overflow-y-auto font-mono text-[11px] text-content-muted flex flex-col-reverse">
          <div>
            {log.length === 0 ? (
              <span className="text-content-faint">No messages yet.</span>
            ) : (
              log.slice(-80).map((l, i) => (
                <div key={i} className="whitespace-pre-wrap break-all">
                  {l}
                </div>
              ))
            )}
          </div>
        </div>
        {connected && (
          <form
            className="mt-2 flex gap-2"
            onSubmit={async (e) => {
              e.preventDefault();
              const input = e.currentTarget.elements.namedItem(
                "cmd",
              ) as HTMLInputElement;
              const cmd = input.value.trim();
              if (!cmd) return;
              input.value = "";
              sendLogged(cmd).catch(() => {});
            }}
          >
            <input
              name="cmd"
              placeholder="Send command"
              autoCapitalize="none"
              autoCorrect="off"
              className="flex-1 bg-app border border-border-ui rounded px-3 py-2 text-base text-content"
            />
            <Button type="submit" size="lg">
              Send
            </Button>
          </form>
        )}
      </section>

      <Button variant="ghost" onClick={toggleTheme}>
        Theme: {theme} (tap to switch)
      </Button>
    </div>
  );
}
