import { defineRpc } from "@getpaseo/plugin";
import { z } from "zod";

/** Draws mermaid source with Pele on the daemon, so clients don't carry Pele's code; null when Pele can't read it. */
export const renderDiagram = defineRpc({
  name: "diagram.render",
  input: z.object({ source: z.string() }),
  output: z.object({ svg: z.string(), width: z.number(), height: z.number() }).nullable(),
});

/**
 * Tag-like text in labels ("<uuid>", "<iframe …>") as mermaid's #lt;/#gt; codes, which Pele draws as text where it would
 * drop a tag. Leaves the <br>/<i> tags mermaid allows, arrows ("<-->", "<|--") and stereotypes ("<<interface>>").
 */
export const escapeTags = (source: string) => source.replace(/(?<!<)<(?!\/?(?:br|i)\s*\/?>)(\/?[a-z][^<>\n]*)>(?!>)/gi, "#lt;$1#gt;");
