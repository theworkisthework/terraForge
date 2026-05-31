import type { ReactNode } from "react";
import clsx from "clsx";

export type BadgeVariant = "error" | "warning" | "info";

interface BadgeProps {
  variant: BadgeVariant;
  children: ReactNode;
  className?: string;
}

const VARIANT_CLASSES: Record<BadgeVariant, string> = {
  error: "bg-red-500/20 text-red-400 border-red-500/30",
  warning: "bg-amber-500/20 text-amber-400 border-amber-500/30",
  info: "bg-sky-500/20 text-sky-400 border-sky-500/30",
};

export function Badge({ variant, children, className }: BadgeProps) {
  return (
    <span
      className={clsx(
        "text-[10px] font-semibold px-1.5 py-0.5 rounded border leading-none",
        VARIANT_CLASSES[variant],
        className,
      )}
    >
      {children}
    </span>
  );
}
