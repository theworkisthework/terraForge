/**
 * The building blocks of the G-code options sections: a collapsible
 * section, a checkbox with a title and description, an override with its
 * value field, and a labelled number field.
 */
import type { ReactNode } from "react";
import { ChevronDown } from "lucide-react";

const FIELD_CLASS =
  "px-2 py-0.5 text-xs rounded bg-secondary border border-secondary-hover text-content focus:outline-none focus:border-accent disabled:opacity-50 disabled:cursor-not-allowed";

/** A section with a collapsing header, or just its content when the dialog
 * shows sections as tabs (`showHeader` false). */
export function OptionSection({
  title,
  open,
  showHeader,
  onToggleOpen,
  children,
}: {
  title: string;
  open: boolean;
  showHeader: boolean;
  onToggleOpen: () => void;
  children: ReactNode;
}) {
  const content = <div className="flex flex-col gap-4 mt-2 mb-1">{children}</div>;
  if (!showHeader) return <div>{content}</div>;
  return (
    <div>
      <button
        type="button"
        onClick={onToggleOpen}
        className="flex items-center gap-1.5 text-xs font-semibold text-content-faint hover:text-content uppercase tracking-wider transition-colors select-none w-full text-left py-1"
      >
        <ChevronDown
          size={13}
          className={`transition-transform duration-150 flex-shrink-0 ${open ? "rotate-0" : "-rotate-90"}`}
        />
        {title}
      </button>
      {open && content}
    </div>
  );
}

/** A checkbox titled `label`, with a line describing what it does. */
export function CheckboxOption({
  label,
  checked,
  onChange,
  description,
}: {
  label: string;
  checked: boolean;
  onChange: () => void;
  description: ReactNode;
}) {
  return (
    <label className="flex items-start gap-3 cursor-pointer select-none">
      <input
        type="checkbox"
        aria-label={label}
        className="mt-0.5 accent-accent cursor-pointer"
        checked={checked}
        onChange={onChange}
      />
      <div>
        <div className="text-sm text-content font-medium">{label}</div>
        <div className="text-xs text-content-muted mt-0.5">{description}</div>
      </div>
    </label>
  );
}

/** An override: a checkbox enabling a number field, beside the machine's
 * own value. */
export function OverrideField({
  label,
  checked,
  onToggle,
  description,
  inputLabel,
  value,
  onChange,
  min,
  step,
  unit,
  machineDefault,
}: {
  label: string;
  checked: boolean;
  onToggle: () => void;
  description: ReactNode;
  inputLabel: string;
  value: number;
  onChange: (value: string) => void;
  min: string;
  step: string;
  unit: string;
  machineDefault: number;
}) {
  return (
    <div className="flex flex-col gap-2">
      <CheckboxOption label={label} checked={checked} onChange={onToggle} description={description} />
      <div className="flex items-center gap-2 pl-6">
        <input
          type="number"
          min={min}
          step={step}
          value={value}
          onChange={(e) => onChange(e.target.value)}
          disabled={!checked}
          aria-label={inputLabel}
          className={`w-24 ${FIELD_CLASS}`}
        />
        <span className="text-xs text-content-muted">{unit}</span>
        <span className="text-xs text-content-faint">
          Machine default: {machineDefault} {unit}
        </span>
      </div>
    </div>
  );
}

/** "Label [number] unit" on one line. */
export function NumberRow({
  label,
  inputLabel,
  value,
  onChange,
  disabled,
  min,
  step,
  unit,
  width = "w-24",
}: {
  label: string;
  inputLabel: string;
  value: number;
  onChange: (value: string) => void;
  disabled: boolean;
  min: string;
  step: string;
  unit: string;
  width?: string;
}) {
  return (
    <div className="flex items-center gap-2">
      <span className="text-xs text-content-muted whitespace-nowrap">{label}</span>
      <input
        type="number"
        min={min}
        step={step}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        disabled={disabled}
        aria-label={inputLabel}
        className={`${width} ${FIELD_CLASS}`}
      />
      <span className="text-xs text-content-muted">{unit}</span>
    </div>
  );
}

/** A compact checkbox with its label beside it. */
export function SmallCheckbox({
  label,
  checked,
  onChange,
  disabled,
}: {
  label: string;
  checked: boolean;
  onChange: () => void;
  disabled?: boolean;
}) {
  return (
    <label className="flex items-center gap-2 cursor-pointer select-none">
      <input
        type="checkbox"
        aria-label={label}
        className="accent-accent cursor-pointer"
        checked={checked}
        onChange={onChange}
        disabled={disabled}
      />
      <span className="text-xs text-content">{label}</span>
    </label>
  );
}
