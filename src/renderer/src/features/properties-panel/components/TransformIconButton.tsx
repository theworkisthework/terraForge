import type { ReactNode } from "react";

interface TransformIconButtonProps {
  title: string;
  onClick: () => void;
  className?: string;
  children: ReactNode;
}

export function TransformIconButton({
  title,
  onClick,
  className,
  children,
}: TransformIconButtonProps) {
  return (
    <button
      className={
        className ??
        "p-1.5 text-content-muted hover:text-content transition-colors rounded hover:bg-secondary/40"
      }
      title={title}
      onClick={onClick}
    >
      {children}
    </button>
  );
}
