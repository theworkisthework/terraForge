import { useState } from "react";

export function usePanelExpansionState() {
  const [expandedIds, setExpandedIds] = useState<Set<string>>(new Set());
  const [collapsedGroupIds, setCollapsedGroupIds] = useState<Set<string>>(
    new Set(),
  );
  const [expandedLayerKeys, setExpandedLayerKeys] = useState<Set<string>>(
    new Set(),
  );

  const toggleExpand = (id: string) => {
    setExpandedIds((prev) => {
      const next = new Set(prev);
      next.has(id) ? next.delete(id) : next.add(id);
      return next;
    });
  };

  const toggleGroupCollapse = (id: string) => {
    setCollapsedGroupIds((prev) => {
      const next = new Set(prev);
      next.has(id) ? next.delete(id) : next.add(id);
      return next;
    });
  };

  const toggleLayerCollapse = (importId: string, layerId: string) => {
    const key = `${importId}:${layerId}`;
    setExpandedLayerKeys((prev) => {
      const next = new Set(prev);
      next.has(key) ? next.delete(key) : next.add(key);
      return next;
    });
  };

  return {
    expandedIds,
    collapsedGroupIds,
    expandedLayerKeys,
    setCollapsedGroupIds,
    toggleExpand,
    toggleGroupCollapse,
    toggleLayerCollapse,
  };
}
