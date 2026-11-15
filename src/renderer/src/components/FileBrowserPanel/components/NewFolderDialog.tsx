import { useState } from "react";
import { Button } from "../../ui";
import { useModalFocus } from "../../../hooks/useModalFocus";
import { folderNameProblem } from "../utils/pathUtils";
import { describeError } from "../../../utils/unexpectedErrors";
import type { RemoteFile } from "../../../../../types";

interface NewFolderDialogProps {
  /** The folder the new one goes in, for the dialog to say. */
  parent: string;
  /** What is already in `parent`, so a clashing name is caught before asking the machine. */
  existing: readonly RemoteFile[];
  /** Makes the folder. Rejects with what went wrong, which the dialog shows. */
  onCreate: (name: string) => Promise<void>;
  onCancel: () => void;
}

/** Asks for a new folder's name and creates it, staying open until it exists or the user gives up. */
export function NewFolderDialog({ parent, existing, onCreate, onCancel }: NewFolderDialogProps) {
  const [name, setName] = useState("");
  const [creating, setCreating] = useState(false);
  const [failure, setFailure] = useState<string | null>(null);

  const problem = folderNameProblem(name, existing);
  const canCreate = name.trim() !== "" && problem === null && !creating;

  const submit = async () => {
    if (!canCreate) return;
    setCreating(true);
    setFailure(null);
    try {
      await onCreate(name.trim());
    } catch (err) {
      setFailure(describeError(err));
      setCreating(false);
    }
  };
  const cancel = () => {
    if (!creating) onCancel();
  };

  const { ref, onKeyDown } = useModalFocus<HTMLDivElement>({
    onEscape: cancel,
    onEnter: () => void submit(),
  });

  // One line of space is kept for the message, so the buttons never move.
  const message = problem ?? failure;

  return (
    <div
      ref={ref}
      role="dialog"
      aria-modal="true"
      aria-labelledby="new-folder-dialog-title"
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/60"
      onClick={(e) => {
        if (e.target === e.currentTarget) cancel();
      }}
      onKeyDown={onKeyDown}
      tabIndex={-1}
    >
      <div className="bg-panel border border-border-ui rounded-lg shadow-2xl w-[320px] p-5 flex flex-col gap-3">
        <h2 id="new-folder-dialog-title" className="text-content font-semibold text-base tracking-wide">
          New Folder
        </h2>
        <label className="flex flex-col gap-1.5 text-xs text-content-muted">
          <span className="truncate" title={parent}>
            Create a folder in {parent}
          </span>
          <input
            type="text"
            value={name}
            onChange={(e) => {
              setName(e.target.value);
              setFailure(null);
            }}
            disabled={creating}
            placeholder="Folder name"
            aria-label="Folder name"
            aria-invalid={message !== null}
            spellCheck={false}
            data-autofocus
            className="w-full px-3 py-1.5 text-sm bg-panel border border-border-ui rounded-lg text-content focus:outline-none focus:border-accent transition-colors disabled:opacity-60"
          />
        </label>
        <p role="alert" className="min-h-[1rem] text-xs leading-4 text-red-400 break-words">
          {message}
        </p>
        <div className="flex gap-2 justify-end">
          <Button variant="secondary" onClick={cancel} disabled={creating}>
            Cancel
          </Button>
          {/* Wide enough for "Creating…", so the label change moves nothing. */}
          <Button variant="primary" onClick={() => void submit()} disabled={!canCreate} className="min-w-[5.5rem]">
            {creating ? "Creating…" : "Create"}
          </Button>
        </div>
      </div>
    </div>
  );
}
