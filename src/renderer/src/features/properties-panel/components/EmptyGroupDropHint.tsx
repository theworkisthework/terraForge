interface EmptyGroupDropHintProps {
  isDropTarget: boolean;
}

export function EmptyGroupDropHint({ isDropTarget }: EmptyGroupDropHintProps) {
  return (
    <div
      className={`mx-3 mb-1 px-2 py-1 text-[9px] text-center border border-dashed rounded transition-colors ${
        isDropTarget
          ? "border-accent/50 text-accent/60"
          : "border-border-ui text-content-faint"
      }`}
    >
      Drop layers here
    </div>
  );
}