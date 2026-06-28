import type { ReactNode } from "react";
import { Button } from "../../../components/ui";

interface TransformIconButtonProps {
  title: string;
  onClick: () => void;
  disabled?: boolean;
  /** When provided, REPLACES the default styling entirely */
  className?: string;
  children: ReactNode;
}

/**
 * Thin wrapper around <Button variant="ghost-hover"> that preserves the
 * legacy API where className *replaces* (not appends to) default styles.
 */
export function TransformIconButton({
  title,
  onClick,
  disabled = false,
  className,
  children,
}: TransformIconButtonProps) {
  if (className) {
    return (
      <button
        className={className}
        title={title}
        disabled={disabled}
        onClick={onClick}
      >
        {children}
      </button>
    );
  }
  return (
    <Button
      variant="ghost-hover"
      title={title}
      disabled={disabled}
      onClick={onClick}
    >
      {children}
    </Button>
  );
}
