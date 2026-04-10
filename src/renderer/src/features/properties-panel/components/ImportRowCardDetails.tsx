import type { ImportPropertiesFormProps } from "./ImportPropertiesForm.types";
import { ImportPropertiesForm } from "./ImportPropertiesForm";

export function ImportRowCardDetails(props: ImportPropertiesFormProps) {
  return (
    <div
      className="px-3 pb-3 pt-2 border-t border-border-ui/30"
      onDragStart={(e) => e.stopPropagation()}
    >
      <ImportPropertiesForm {...props} />
    </div>
  );
}
