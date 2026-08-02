import { PanelHeading } from "../features/properties-panel/components/PanelHeading";
import { PanelContainer } from "../features/properties-panel/components/PanelContainer";
import { LayersPanelContent } from "../features/properties-panel/components/LayersPanelContent";

interface PropertiesPanelProps {
  onHide?: () => void;
}

/**
 * Properties panel — the right-side sidebar.
 *
 * Delegates all hook orchestration and rendering to LayersPanelContent
 * (in the properties-panel feature domain) to keep this entry point thin.
 */
export function PropertiesPanel({ onHide }: PropertiesPanelProps = {}) {
  return (
    <PanelContainer>
      <PanelHeading onHide={onHide} />
      <LayersPanelContent />
    </PanelContainer>
  );
}
