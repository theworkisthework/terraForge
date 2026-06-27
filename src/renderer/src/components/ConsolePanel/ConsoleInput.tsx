import { useState } from "react";
import { Button } from "../ui";

interface ConsoleInputProps {
  connected: boolean;
  onSend: (cmd: string) => void;
}

/**
 * G-code command input bar with a ">" prompt, text input, and Send button.
 */
export function ConsoleInput({ connected, onSend }: ConsoleInputProps) {
  const [cmd, setCmd] = useState("");

  const handleSend = () => {
    const trimmed = cmd.trim();
    if (!trimmed || !connected) return;
    onSend(trimmed);
    setCmd("");
  };

  return (
    <div className="flex items-center border-t border-border-ui px-2 py-1 shrink-0 bg-terminal">
      <span className="text-green-600 font-mono text-xs mr-2 shrink-0">
        {">"}
      </span>
      <input
        type="text"
        aria-label="Send G-code command"
        value={cmd}
        onChange={(e) => setCmd(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === "Enter") handleSend();
        }}
        disabled={!connected}
        placeholder={connected ? "Send command…" : "Not connected"}
        className="flex-1 bg-transparent font-mono text-xs text-green-400 placeholder-gray-700 outline-none disabled:opacity-40"
      />
      <Button
        variant="secondary"
        size="xs"
        onClick={handleSend}
        disabled={!connected || !cmd.trim()}
        className="shrink-0 ml-1"
      >
        Send
      </Button>
    </div>
  );
}