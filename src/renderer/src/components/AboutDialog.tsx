import { useEffect, useState } from "react";
import { PenTool } from "lucide-react";

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
      <div className="bg-[#16213e] border border-[#0f3460] rounded-xl shadow-2xl w-[340px] p-7 flex flex-col items-center gap-4 text-center">
        {/* Logo placeholder */}
        <div className="w-16 h-16 rounded-2xl bg-[#0f3460] flex items-center justify-center">
          <PenTool className="w-8 h-8 text-[#e94560]" strokeWidth={1.5} />
        </div>

        {/* Title */}
        <div>
          <h1
            id="about-dialog-title"
            className="text-[#e94560] font-bold tracking-widest text-xl"
          >
            terraForge
          </h1>
          <p className="text-gray-400 text-sm mt-1">terraPen plotter control</p>
        </div>

        {/* Version */}
        <div className="bg-[#0f3460]/50 rounded-lg px-4 py-2 w-full">
          <span className="text-xs text-gray-500 uppercase tracking-wider">
            Version
          </span>
          <p className="text-white font-mono text-sm mt-0.5">{version}</p>
        </div>

        {/* License & copyright */}
        <div className="text-xs text-gray-500 leading-relaxed space-y-1">
          <p>Released under the MIT License.</p>
          <p>© 2026 Mark Benson</p>
          <p className="text-gray-600">
            A &lsquo;THEWORKISTHEWORK&rsquo; project
          </p>
        </div>

        {/* Close */}
        <button
          onClick={onClose}
          autoFocus
          className="mt-1 px-5 py-1.5 text-sm rounded bg-[#0f3460] hover:bg-[#1a4a8a] transition-colors text-white"
        >
          Close
        </button>
      </div>
    </div>
  );
}
