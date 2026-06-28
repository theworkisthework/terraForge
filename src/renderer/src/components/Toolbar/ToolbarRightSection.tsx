import { Moon, Sun } from "lucide-react";
import { Button } from "../ui";
import { ConnectionStatus } from "./ConnectionStatus";

interface ToolbarRightSectionProps {
  theme: string;
  onToggleTheme: () => void;
  onOpenSettings: () => void;
}

/**
 * Right-aligned cluster in the toolbar: connection status, theme toggle,
 * and settings button.
 */
export function ToolbarRightSection({
  theme,
  onToggleTheme,
  onOpenSettings,
}: ToolbarRightSectionProps) {
  return (
    <div className="ml-auto flex items-center gap-3">
      <ConnectionStatus />

      <Button
        variant="secondary"
        size="sm"
        onClick={onToggleTheme}
        aria-label={
          theme === "dark" ? "Switch to light mode" : "Switch to dark mode"
        }
        aria-pressed={theme === "light"}
        title={
          theme === "dark" ? "Switch to light mode" : "Switch to dark mode"
        }
      >
        {theme === "dark" ? (
          <Sun size={14} aria-hidden="true" />
        ) : (
          <Moon size={14} aria-hidden="true" />
        )}
      </Button>

      <Button
        variant="secondary"
        size="sm"
        onClick={onOpenSettings}
        aria-label="Machine settings"
        title="Machine settings"
      >
        ⚙
      </Button>
    </div>
  );
}
