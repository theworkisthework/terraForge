import { useState } from "react";
import { useMachineStore } from "../../../store/machineStore";
import {
  connectMachine,
  disconnectMachine,
} from "../../../features/machine/utils/machineConnection";
import { Button } from "../../ui";
import { Tooltip } from "../../Tooltip";

interface Props {
  /** The profile shown in the dialog. */
  selectedId: string | null;
  isNew: boolean;
  isDirty: boolean;
}

/**
 * Connect / Disconnect from inside the settings dialog, for the profile
 * being viewed. Styled like the toolbar's (red Connect, grey Disconnect
 * that turns red on hover) and makes the same connection, so they agree.
 * Only the active profile can connect, and only once its edits are saved:
 * the connection uses the saved settings, and connecting locks them.
 */
export function MachineConnectButton({ selectedId, isNew, isDirty }: Props) {
  const configs = useMachineStore((s) => s.configs);
  const activeConfigId = useMachineStore((s) => s.activeConfigId);
  const connected = useMachineStore((s) => s.connected);
  const wsLive = useMachineStore((s) => s.wsLive);
  const setConnected = useMachineStore((s) => s.setConnected);
  const [busy, setBusy] = useState(false);

  const activeConfig = configs.find((c) => c.id === activeConfigId) ?? null;
  const isActiveProfile =
    !isNew && !!selectedId && selectedId === activeConfigId;
  // Wi-Fi is marked connected once the machine is found, before its socket
  // answers — the toolbar shows that as "Connecting…" too.
  const waitingForMachine =
    connected && activeConfig?.connection.type === "wifi" && !wsLive;

  if (connected) {
    return (
      <Tooltip
        text={
          waitingForMachine
            ? "Waiting for the machine to respond. Disconnect to stop."
            : "Disconnect from the machine"
        }
      >
        <Button
          variant="secondary"
          className="hover:bg-accent"
          disabled={busy}
          onClick={async () => {
            if (!activeConfig) return;
            setBusy(true);
            try {
              await disconnectMachine(activeConfig);
              setConnected(false);
            } finally {
              setBusy(false);
            }
          }}
        >
          Disconnect
        </Button>
      </Tooltip>
    );
  }

  const blocker = !isActiveProfile
    ? "Set this machine as active to connect to it"
    : isDirty
      ? "Save changes first: the connection uses the saved settings"
      : null;

  return (
    <Tooltip
      text={busy ? "Connecting…" : (blocker ?? "Connect to this machine")}
    >
      <Button
        variant="primary"
        disabled={!!blocker || busy || !activeConfig}
        onClick={async () => {
          if (!activeConfig) return;
          setBusy(true);
          try {
            // Never rejects: failures are shown on the connection task.
            await connectMachine(activeConfig);
          } finally {
            setBusy(false);
          }
        }}
      >
        {busy ? "Connecting…" : "Connect"}
      </Button>
    </Tooltip>
  );
}
