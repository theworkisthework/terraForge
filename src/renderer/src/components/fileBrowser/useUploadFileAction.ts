import { useCallback } from "react";
import { useTaskStore } from "../../store/taskStore";

type UpsertTask = ReturnType<typeof useTaskStore>["upsertTask"];

export function useUploadFileAction(upsertTask: UpsertTask) {
  return useCallback(
    (localPath: string, remotePath: string, taskId: string, name: string) => {
      upsertTask({
        id: taskId,
        type: "file-upload",
        label: `Uploading ${name}`,
        progress: 0,
        status: "running",
      });

      window.terraForge.fluidnc
        .uploadFile(taskId, localPath, remotePath)
        .catch(console.error);
    },
    [upsertTask],
  );
}
