import type { ReactNode } from "react";

export interface TabItem<T extends string> {
  id: T;
  label: ReactNode;
}

interface TabHeaderProps<T extends string> {
  ariaLabel: string;
  tabs: ReadonlyArray<TabItem<T>>;
  activeTab: T;
  onTabChange: (tab: T) => void;
  className?: string;
}

export function TabHeader<T extends string>({
  ariaLabel,
  tabs,
  activeTab,
  onTabChange,
  className,
}: TabHeaderProps<T>) {
  return (
    <div
      role="tablist"
      aria-label={ariaLabel}
      className={`flex items-end gap-1 border-b border-border-ui ${className ?? ""}`.trim()}
    >
      {tabs.map((tab) => {
        const selected = tab.id === activeTab;
        return (
          <button
            key={tab.id}
            role="tab"
            aria-selected={selected}
            onClick={() => onTabChange(tab.id)}
            className={`relative -mb-px px-3 py-1.5 text-sm font-medium transition-colors border rounded-t-md rounded-b-none ${
              selected
                ? "bg-panel text-content border-border-ui border-b-panel"
                : "bg-transparent text-content-muted border-transparent hover:text-content hover:bg-secondary/30"
            }`}
          >
            {tab.label}
          </button>
        );
      })}
    </div>
  );
}
