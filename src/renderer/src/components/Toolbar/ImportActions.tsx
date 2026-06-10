interface ImportActionsProps {
  onImport: () => void;
  onOpenGcodeDialog: () => void;
  generating: boolean;
  importsEmpty: boolean;
}

export function ImportActions({
  onImport,
  onOpenGcodeDialog,
  generating,
  importsEmpty,
}: ImportActionsProps) {
  return (
    <>
      {/* Import — SVG / PDF / G-code, detected from extension */}
      <button
        onClick={onImport}
        className="px-3 py-1 rounded text-sm bg-secondary hover:bg-secondary-hover transition-colors"
        title="Import an SVG, PDF, or G-code file"
      >
        Import
      </button>

      {/* Generate G-code — opens options dialog */}
      <button
        onClick={onOpenGcodeDialog}
        disabled={generating || importsEmpty}
        className="px-3 py-1 rounded text-sm bg-accent hover:bg-accent-hover disabled:opacity-40 transition-colors text-white"
        title="Choose generation options then generate G-code"
      >
        {generating ? "Generating…" : "Generate G-code"}
      </button>
    </>
  );
}