import React from "react";

interface FieldProps {
  label: string;
  children: React.ReactNode;
}

export function Field({ label, children }: FieldProps) {
  return (
    <div>
      <label className="block text-xs text-content-muted mb-1">{label}</label>
      {children}
    </div>
  );
}
