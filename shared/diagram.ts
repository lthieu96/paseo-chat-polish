import { defineRpc } from "@getpaseo/plugin";
import { z } from "zod";

/** Draws mermaid source with Pele on the daemon, so clients don't carry Pele's code; null when Pele can't read it. */
export const renderDiagram = defineRpc({
  name: "diagram.render",
  input: z.object({ source: z.string() }),
  output: z.object({ svg: z.string(), width: z.number(), height: z.number() }).nullable(),
});
