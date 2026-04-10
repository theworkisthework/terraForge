import { useImportsByGroupListModel } from "../hooks/useImportsByGroupListModel";
import type { ImportsByGroupListProps } from "./ImportsByGroupList.types";
import { GroupedImportsSection } from "./GroupedImportsSection";
import { UngroupedImportsSection } from "./UngroupedImportsSection";
export function ImportsByGroupList(props: ImportsByGroupListProps) {
  const { groupedSectionProps, ungroupedSectionProps } =
    useImportsByGroupListModel(props);

  return (
    <>
      <GroupedImportsSection {...groupedSectionProps} />
      <UngroupedImportsSection {...ungroupedSectionProps} />
    </>
  );
}
