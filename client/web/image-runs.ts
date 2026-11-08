// Which images in a rendered reply stack together. Pure, so it is tested without a DOM (test/image-runs.test.mjs).

export type ImageNode = { nodeType: number; nodeName: string; nodeValue: string | null; childNodes: ArrayLike<ImageNode> };

// Elements that end a stack even without text: a divider, and blocks a picture can't share a run with.
const BREAKS = new Set(["HR", "PRE", "TABLE", "INPUT", "IFRAME", "VIDEO", "SVG", "CANVAS", "UL", "OL", "BLOCKQUOTE"]);
// What ends a stack by section: a heading or a divider.
const SECTION_BREAKS = new Set(["H1", "H2", "H3", "H4", "H5", "H6", "HR"]);

/** How images group into stacks (Prefs.imageStackBy): a run with nothing between, everything in a section, or the whole reply. */
export type StackBy = "row" | "section" | "reply";

/**
 * The groups of images in a rendered reply, in reading order. "row": images with no visible text, divider or block between
 * them. "section": everything up to the next heading or divider. "reply": all of them.
 */
export function imageRuns(root: ImageNode, by: StackBy = "row"): ImageNode[][] {
  const runs: ImageNode[][] = [];
  let run: ImageNode[] = [];
  const end = () => {
    if (run.length) runs.push(run);
    run = [];
  };
  const walk = (node: ImageNode) => {
    if (node.nodeType === 3) {
      if (by === "row" && node.nodeValue?.trim()) end();
      return;
    }
    if (node.nodeType !== 1) return;
    const name = node.nodeName.toUpperCase();
    if (name === "IMG") {
      run.push(node);
      return;
    }
    if (name === "BR") return;
    if (by === "row" && BREAKS.has(name)) {
      // A block ends the run on both sides; images inside it can still stack with each other.
      end();
      for (const child of Array.from(node.childNodes)) walk(child);
      end();
      return;
    }
    if (by === "section" && SECTION_BREAKS.has(name)) {
      end();
      return;
    }
    for (const child of Array.from(node.childNodes)) walk(child);
  };
  walk(root);
  end();
  return runs;
}
