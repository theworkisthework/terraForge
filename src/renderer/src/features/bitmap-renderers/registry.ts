import { spiralAmplitudeRenderer, type BitmapRendererDefinition } from "./spiralAmplitude";

export const bitmapRenderers: BitmapRendererDefinition[] = [
  spiralAmplitudeRenderer,
];

export function getBitmapRenderer(id: string | undefined): BitmapRendererDefinition {
  return (
    bitmapRenderers.find((renderer) => renderer.id === id) ??
    spiralAmplitudeRenderer
  );
}