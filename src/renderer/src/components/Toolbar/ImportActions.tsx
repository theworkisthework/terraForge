import { Button } from "../ui";

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
      <Button
        variant="secondary"
        onClick={onImport}
        title="Import an SVG, PDF, or G-code file"
      >
        Import
      </Button>

      <Button
        variant="primary"
        onClick={onOpenGcodeDialog}
        disabled={generating || importsEmpty}
        loading={generating}
        title="Choose generation options then generate G-code"
      >
        {generating ? "Generating…" : "Generate G-code"}
      </Button>
    </>
  );
}
