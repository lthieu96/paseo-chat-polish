import { Platform } from "react-native";
import type { WebDocument } from "./dom";
import { stopFollowingExpansion } from "./prompts";
import { ROW } from "./selectors";

declare const document: WebDocument;

/** Browser-only card shapes and hover transitions; native clients keep their fallback styles. */
export function stylePluginViews() {
  if (Platform.OS !== "web" || typeof document === "undefined") return () => {};
  const style = document.createElement("style");
  style.textContent = `
@supports (corner-shape: squircle) { [data-cp-squircle="card"] { border-radius: 28px !important; corner-shape: squircle; } }
[data-cp-row], ${ROW} > button { transition: opacity 80ms ease-out, background-color 80ms ease-out; }
[data-cp-row] [dir], ${ROW} [data-cp-part="row-label"] > [dir] { transition: color 80ms ease-out; }
/* One scroller for both axes keeps the horizontal bar visible with tall diffs. */
[data-cp-nowrap] { overflow: auto !important; }
[data-cp-nowrap] > div { width: max-content; min-width: 100%; }
[data-cp-nowrap] [data-pmono] { white-space: pre !important; overflow-wrap: normal !important; }
/* A shared light sweep preserves the action/target colors and works when row icons are hidden. */
[data-cp-running-label] {
  --cp-running-mask: linear-gradient(100deg, rgb(0 0 0 / 0.82) 35%, #000 50%, rgb(0 0 0 / 0.82) 65%);
  -webkit-mask-image: var(--cp-running-mask); mask-image: var(--cp-running-mask);
  -webkit-mask-size: 250% 100%; mask-size: 250% 100%;
  animation: cp-running-label 1.8s linear infinite;
}
@keyframes cp-running-label {
  from { -webkit-mask-position: 150% 0; mask-position: 150% 0; }
  to { -webkit-mask-position: -50% 0; mask-position: -50% 0; }
}
/* Animate the grid track instead of guessing a max-height; long and streaming output keep their natural size. */
[data-cp-expand] { display: grid !important; grid-template-rows: 1fr; opacity: 1; transition: grid-template-rows 100ms cubic-bezier(0.23, 1, 0.32, 1), opacity 100ms ease-out; }
[data-cp-expand="closed"] { grid-template-rows: 0fr; opacity: 0; pointer-events: none; }
@starting-style {
  [data-cp-expand="open"] { grid-template-rows: 0fr; opacity: 0.55; }
}
@media (prefers-reduced-motion: reduce) {
  [data-cp-running-label] { animation: none; -webkit-mask-image: none; mask-image: none; }
  [data-cp-expand] { transition: none; }
  [data-cp-row], [data-cp-row] [dir], ${ROW} > button, ${ROW} [data-cp-part="row-label"] > [dir] { transition: none; }
}`;
  document.head.appendChild(style);
  return () => { stopFollowingExpansion(); style.remove(); };
}
