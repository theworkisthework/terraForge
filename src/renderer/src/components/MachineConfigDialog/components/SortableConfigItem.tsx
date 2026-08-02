import React from "react";
import { Check, GripVertical } from "lucide-react";
import { useSortable } from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";

interface SortableConfigItemProps {
  config: { id: string; name: string };
  isSelected: boolean;
  isActive: boolean;
  onSelect: () => void;
}

export function SortableConfigItem({
  config,
  isSelected,
  isActive,
  onSelect,
}: SortableConfigItemProps) {
  const {
    attributes,
    listeners,
    setNodeRef,
    transform,
    transition,
    isDragging,
  } = useSortable({ id: config.id });

  const style: React.CSSProperties = {
    transform: CSS.Transform.toString(transform),
    transition,
    opacity: isDragging ? 0.4 : 1,
    zIndex: isDragging ? 50 : undefined,
  };

  return (
    <div
      ref={setNodeRef}
      style={style}
      className={`flex items-center group ${
        isSelected ? "bg-accent" : "hover:bg-secondary"
      }`}
    >
      <span
        {...attributes}
        {...listeners}
        className="px-2 py-2 cursor-grab active:cursor-grabbing text-content-faint group-hover:text-content-muted flex-shrink-0 select-none"
        title="Drag to reorder"
      >
        <GripVertical size={14} />
      </span>
      <button
        onClick={onSelect}
        className={`flex-1 text-left py-2 pr-4 text-sm transition-colors truncate min-w-0 ${
          isSelected ? "text-white" : "text-content"
        }`}
      >
        {config.name}
        {isActive && <Check className="ml-1 inline-block text-green-400" size={12} strokeWidth={2.5} />}
      </button>
    </div>
  );
}
