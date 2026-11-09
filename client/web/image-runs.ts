// Which images in a rendered reply stack together. Pure, so it is tested without a DOM (test/image-runs.test.mjs).

export type ImageNode = { nodeType: number; nodeName: string; nodeValue: string | null; childNodes: ArrayLike<ImageNode> };

// Elements that end a stack even without text: a divider, and blocks a picture can't share a run with.
const BREAKS = new Set(["HR", "PRE", "TABLE", "INPUT", "IFRAME", "VIDEO", "SVG", "CANVAS", "UL", "OL", "BLOCKQUOTE"]);

/** The runs of images in a rendered reply, in reading order: images with no visible text, divider or block between them. */
export function imageRuns(root: ImageNode): ImageNode[][] {
  const runs: ImageNode[][] = [];
  let run: ImageNode[] = [];
  const end = () => {
    if (run.length) runs.push(run);
    run = [];
  };
  const walk = (node: ImageNode) => {
    if (node.nodeType === 3) {
      if (node.nodeValue?.trim()) end();
      return;
    }
    if (node.nodeType !== 1) return;
    const name = node.nodeName.toUpperCase();
    if (name === "IMG") {
      run.push(node);
      return;
    }
    if (name === "BR") return;
    if (BREAKS.has(name)) {
      // A block ends the run on both sides; images inside it can still stack with each other.
      end();
      for (const child of Array.from(node.childNodes)) walk(child);
      end();
      return;
    }
    for (const child of Array.from(node.childNodes)) walk(child);
  };
  walk(root);
  end();
  return runs;
}
