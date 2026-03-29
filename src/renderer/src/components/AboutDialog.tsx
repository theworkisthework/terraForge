import { useEffect, useState } from "react";
import TerraForgeLogo from "../assets/terraForgeAnimated.svg?react";
import TerraForgeLogotype from "../assets/terraForgeLogotype.svg?react";

interface Props {
  onClose: () => void;
}

export function AboutDialog({ onClose }: Props) {
  const [version, setVersion] = useState<string>("…");

  useEffect(() => {
    window.terraForge.app
      .getVersion()
      .then(setVersion)
      .catch(() => setVersion("unknown"));
  }, []);

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "Escape") onClose();
  };

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-labelledby="about-dialog-title"
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/60"
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
      onKeyDown={handleKeyDown}
      tabIndex={-1}
    >
      <div className="bg-panel border border-border-ui rounded-xl shadow-2xl w-[340px] p-7 flex flex-col items-center gap-4 text-center">
        {/* Logo */}
        <TerraForgeLogo
          aria-label="terraForge logo"
          className="w-[139px] h-[139px] -mb-2"
        />

        {/* Title */}
        <div>
          <TerraForgeLogotype
            id="about-dialog-title"
            aria-label="terraForge"
            className="text-accent h-[28px] w-auto mx-auto"
          />
          <p className="text-content-muted text-sm mt-2">
            terraPen plotter control
          </p>
        </div>

        {/* Version */}
        <div className="bg-secondary/50 rounded-lg px-4 py-2 w-full">
          <span className="text-xs text-content-faint uppercase tracking-wider">
            Version
          </span>
          <p className="text-content font-mono text-sm mt-0.5">{version}</p>
        </div>

        {/* License & copyright */}
        <div className="text-xs text-content-faint leading-relaxed space-y-1">
          <p>Released under the MIT License.</p>
          <p>© 2026 Mark Benson</p>
          <p className="pt-1 border-t border-border-ui">
            Logo &amp; logotype © 2026 Richard Hurst
          </p>
          <p className="pt-1 border-t border-border-ui">
            A &lsquo;THEWORKISTHEWORK&rsquo; project
          </p>
          <a
            href="https://github.com/theworkisthework/terraForge"
            target="_blank"
            rel="noopener noreferrer"
            className="text-accent hover:underline"
          >
            github.com/theworkisthework/terraForge
          </a>
        </div>

        {/* Close */}
        <button
          onClick={onClose}
          autoFocus
          className="mt-1 px-5 py-1.5 text-sm rounded bg-secondary hover:bg-secondary-hover transition-colors text-content"
        >
          Close
        </button>
      </div>
    </div>
  );
}
