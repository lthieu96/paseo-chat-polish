// The image viewer for a stack of images Paseo drew itself (a reply with text), opened from a click in the DOM.
// image-stacks.ts calls openStackViewer; StackViewerHost (views.tsx), mounted with the dashboard's sidebar row (not while
// the sidebar is hidden), shows it.
import { useSyncExternalStore } from "react";

export type StackImage = { alt: string; url: string };
type Shown = { images: StackImage[]; index: number } | undefined;

let shown: Shown;
let hosts = 0;
const listeners = new Set<() => void>();
const notify = () => listeners.forEach((l) => l());

/** Whether a host is mounted to show the viewer; when none is (sidebar hidden), clicks are left to Paseo. */
export const stackViewerHosted = () => hosts > 0;

export function openStackViewer(images: StackImage[], index: number) {
  shown = { images, index };
  notify();
}

export function setStackViewerIndex(index: number) {
  if (!shown) return;
  shown = { ...shown, index };
  notify();
}

export function closeStackViewer() {
  shown = undefined;
  notify();
}

/** Counts the host while mounted. Returns cleanup. */
export function registerStackViewerHost() {
  hosts++;
  return () => {
    hosts--;
  };
}

export function useStackViewer(): Shown {
  return useSyncExternalStore(
    (listener) => (listeners.add(listener), () => void listeners.delete(listener)),
    () => shown,
  );
}
