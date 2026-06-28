import { type ButtonHTMLAttributes, type ReactNode, forwardRef } from "react";

// ── Types ──────────────────────────────────────────────────────────────────────

export type ButtonVariant =
  | "primary" // bg-accent hover:bg-accent-hover text-white
  | "secondary" // bg-secondary hover:bg-secondary-hover text-content
  | "ghost" // text-content-faint hover:text-content (no bg)
  | "ghost-hover" // text-content-muted hover:text-content hover:bg-secondary/40
  | "danger" // bg-red-800 hover:bg-red-700 text-white
  | "toggle"; // selected ? accent : secondary

export type ButtonSize =
  | "xs" // text-[9px] px-1 py-0.5 rounded
  | "sm" // text-xs px-2 py-1 rounded
  | "md" // text-sm px-3 py-1.5 rounded (default)
  | "lg" // text-sm px-4 py-2 rounded-lg
  | "icon-sm" // w-7 h-7 rounded (icon-only square)
  | "icon-md"; // w-8 h-8 rounded (icon-only square, larger)

export interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: ButtonVariant;
  size?: ButtonSize;
  /** Used by `toggle` variant — when true applies accent styling */
  selected?: boolean;
  /** Disables the button and shows a "working…" state */
  loading?: boolean;
  /** Optional icon node rendered before children */
  icon?: ReactNode;
  children?: ReactNode;
}

// ── Class maps ─────────────────────────────────────────────────────────────────

const variantClasses: Record<ButtonVariant, string> = {
  primary: "bg-accent hover:bg-accent-hover text-white",
  secondary: "bg-secondary hover:bg-secondary-hover text-content",
  ghost: "text-content-faint hover:text-content",
  "ghost-hover": "text-content-muted hover:text-content hover:bg-secondary/40",
  danger: "bg-red-800 hover:bg-red-700 text-white",
  toggle: "", // handled dynamically
};

const sizeClasses: Record<ButtonSize, string> = {
  xs: "text-[9px] px-1 py-0.5 rounded",
  sm: "text-xs px-2 py-1 rounded",
  md: "text-sm px-3 py-1.5 rounded",
  lg: "text-sm px-4 py-2 rounded-lg",
  "icon-sm": "w-7 h-7 rounded inline-flex items-center justify-center",
  "icon-md": "w-8 h-8 rounded inline-flex items-center justify-center",
};

const baseClasses =
  "transition-colors disabled:opacity-40 disabled:cursor-not-allowed inline-flex items-center justify-center gap-1.5 select-none";

// ── Component ──────────────────────────────────────────────────────────────────

export const Button = forwardRef<HTMLButtonElement, ButtonProps>(
  (
    {
      variant = "secondary",
      size = "md",
      selected = false,
      loading = false,
      icon,
      children,
      className = "",
      disabled,
      ...rest
    },
    ref,
  ) => {
    const variantCls =
      variant === "toggle"
        ? selected
          ? "bg-accent text-white"
          : "bg-secondary hover:bg-secondary-hover text-content"
        : variantClasses[variant];

    return (
      <button
        ref={ref}
        disabled={disabled || loading}
        className={`${baseClasses} ${variantCls} ${sizeClasses[size]} ${className}`.trim()}
        {...rest}
      >
        {icon && <span className="shrink-0">{icon}</span>}
        {children}
      </button>
    );
  },
);

Button.displayName = "Button";
