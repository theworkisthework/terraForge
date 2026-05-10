import type { KeyboardEvent, ReactNode } from "react";

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
  const activeIndex = tabs.findIndex((tab) => tab.id === activeTab);

  const getNextIndex = (currentIndex: number, key: string): number | null => {
    if (tabs.length === 0) return null;
    if (key === "Home") return 0;
    if (key === "End") return tabs.length - 1;
    if (key === "ArrowRight" || key === "ArrowDown") {
      return (currentIndex + 1) % tabs.length;
    }
    if (key === "ArrowLeft" || key === "ArrowUp") {
      return (currentIndex - 1 + tabs.length) % tabs.length;
    }
    return null;
  };

  const focusTabAt = (source: HTMLButtonElement, index: number) => {
    const tabList = source.closest('[role="tablist"]');
    if (!tabList) return;
    const tabButtons =
      tabList.querySelectorAll<HTMLButtonElement>('[role="tab"]');
    const target = tabButtons[index];
    target?.focus();
  };

  const handleKeyDown = (
    e: KeyboardEvent<HTMLButtonElement>,
    index: number,
    id: T,
  ) => {
    const nextIndex = getNextIndex(index, e.key);

    if (nextIndex !== null) {
      e.preventDefault();
      const sourceButton = e.currentTarget;
      const nextTab = tabs[nextIndex];
      if (nextTab) {
        onTabChange(nextTab.id);
        queueMicrotask(() => focusTabAt(sourceButton, nextIndex));
      }
      return;
    }

    if (e.key === "Enter" || e.key === " ") {
      e.preventDefault();
      onTabChange(id);
    }
  };

  return (
    <div
      role="tablist"
      aria-label={ariaLabel}
      className={`flex items-end gap-1 border-b border-border-ui ${className ?? ""}`.trim()}
    >
      {tabs.map((tab, index) => {
        const selected = tab.id === activeTab;
        return (
          <button
            key={tab.id}
            role="tab"
            aria-selected={selected}
            tabIndex={index === (activeIndex >= 0 ? activeIndex : 0) ? 0 : -1}
            onClick={() => onTabChange(tab.id)}
            onKeyDown={(e) => handleKeyDown(e, index, tab.id)}
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
