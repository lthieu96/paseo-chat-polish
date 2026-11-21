// The language is the whole first word of the info string, so ```ui.json and
// ```ui+json stay ordinary code blocks rather than handing the reply over.
const FENCE_OPEN = /^ {0,3}(`{3,}|~{3,})\s*(\S*)/;

/**
 * True when the reply opens a ```ui or ```app fence. Plugins like genui render
 * those live, and Paseo offers an assistant message to chat transformers
 * first-wins in plugin-name order, where chat-polish sorts before them: the
 * transformer must leave such a reply unclaimed or the widgets show as code.
 * Wait for the opening line during streaming so a partial language stays put.
 */
export function hasUiFence(text: string, phase = "complete"): boolean {
  const lines = text.split("\n");
  for (let index = 0; index < lines.length; index++) {
    const open = FENCE_OPEN.exec(lines[index] ?? "");
    if (open === null) continue;
    if (phase === "streaming" && index === lines.length - 1) return false;
    const language = (open[2] ?? "").toLowerCase();
    if (language === "ui" || language === "app") return true;
    // A fence of another language still swallows its body: a ```ui inside it
    // is code being quoted, not a block to hand over. Skip to the closing
    // marker (or the end of an unterminated fence).
    const marker = open[1] ?? "```";
    const closing = new RegExp(`^ {0,3}${marker[0] === "`" ? "`" : "~"}{${marker.length},}\\s*$`);
    let close = index + 1;
    while (close < lines.length && !closing.test(lines[close] ?? "")) close++;
    index = close;
  }
  return false;
}
