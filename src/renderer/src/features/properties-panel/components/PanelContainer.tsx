import type { ReactNode } from "react";

interface PanelContainerProps {
  children: ReactNode;
}

/** Outermost flex container that fills the available panel height. */
export function PanelContainer({ children }: PanelContainerProps) {
  return <div className="flex flex-col h-full">{children}</div>;
}
