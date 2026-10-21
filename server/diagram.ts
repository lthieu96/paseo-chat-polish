import { PeleError, render } from "pele";
import { escapeTags } from "../shared/diagram";

// Off the browser Pele sizes labels with its built-in Helvetica/Arial metrics, so the drawing names that font
// (metric-compatible Liberation Sans on Linux) and its labels fit wherever it's shown.
const FONT = 'Helvetica, Arial, "Liberation Sans", sans-serif';

/** Mermaid source as an SVG drawn by Pele, or null when Pele can't read it (the chat then shows the source). */
export function renderDiagramSvg({ source }: { source: string }) {
  try {
    const r = render(escapeTags(source), { fontFamily: FONT, fontSize: 13, responsive: false, links: false, images: false });
    return { svg: r.svg, width: Math.ceil(r.width), height: Math.ceil(r.height) };
  } catch (error) {
    if (error instanceof PeleError) return null;
    throw error;
  }
}
