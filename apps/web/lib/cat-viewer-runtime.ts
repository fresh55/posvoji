import type { ModelViewerElement } from "@google/model-viewer";
import { $scene } from "@google/model-viewer/lib/model-viewer-base.js";
import { createCatPicker } from "./cat-picking";

// The only dependency-internal bridge. Loaded with model-viewer in the browser;
// asset/adapter incompatibility falls back to the viewer's public picking API.
export function createViewerCatPicker(viewer: ModelViewerElement) {
  const scene = viewer[$scene];
  const root = scene.models[0];
  if (!root) throw new Error("Cat scene has not loaded");
  return createCatPicker(root, () => scene.getCamera(), (x, y) => scene.getNDC(x, y));
}
