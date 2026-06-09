import React from "react";

interface SectionProps {
  title: React.ReactNode;
  children: React.ReactNode;
}

export function Section({ title, children }: SectionProps) {
  return (
    <div>
      <h3 className="text-xs font-semibold uppercase tracking-wider text-content-faint mb-3">
        {title}
      </h3>
      <div className="space-y-3">{children}</div>
    </div>
  );
}
